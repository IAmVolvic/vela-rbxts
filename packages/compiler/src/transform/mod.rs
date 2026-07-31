pub(crate) mod context;
pub(crate) mod emit;
pub(crate) mod jsx;
pub(crate) mod module;
pub(crate) mod runtime;
pub(crate) mod runtime_host;

use crate::api::{Diagnostic, EditorRange, TransformOptions, TransformResult};
use crate::config::resolve::parse_config_with_diagnostic;
use crate::transform::context::VelaTransformer;
use swc_core::{
    common::{BytePos, FileName, SourceMap, Spanned, sync::Lrc},
    ecma::{
        parser::{Syntax, TsSyntax, error::Error as ParseError, parse_file_as_module},
        visit::VisitMutWith,
    },
};

fn parse_error_diagnostic(cm: &SourceMap, file_start: BytePos, error: &ParseError) -> Diagnostic {
    let span = error.span();
    let location = cm.lookup_char_pos(span.lo());

    Diagnostic {
        level: "error".to_owned(),
        code: "tsx-parse-failed".to_owned(),
        message: format!(
            "Failed to parse TSX input at line {}, column {}: {}",
            location.line,
            location.col_display + 1,
            error.kind().msg()
        ),
        token: None,
        range: Some(EditorRange {
            start: span.lo().0.saturating_sub(file_start.0),
            end: span.hi().0.saturating_sub(file_start.0),
        }),
    }
}

pub(crate) fn transform_impl(source: String, options: Option<TransformOptions>) -> TransformResult {
    let (config, config_diagnostic) = parse_config_with_diagnostic(
        options
            .as_ref()
            .and_then(|value| value.config_json.as_deref()),
    );
    let cm: Lrc<SourceMap> = Default::default();
    let fm = cm.new_source_file(FileName::Custom("input.tsx".into()).into(), source.clone());
    let mut recovered_errors = Vec::new();
    let parsed_module = parse_file_as_module(
        &fm,
        Syntax::Typescript(TsSyntax {
            decorators: true,
            tsx: true,
            ..Default::default()
        }),
        Default::default(),
        None,
        &mut recovered_errors,
    );

    let mut diagnostics: Vec<Diagnostic> = config_diagnostic.into_iter().collect();

    let mut module = match parsed_module {
        Ok(module) => module,
        Err(error) => {
            diagnostics.push(parse_error_diagnostic(&cm, fm.start_pos, &error));
            return TransformResult {
                code: source,
                diagnostics,
                changed: false,
                ir: Vec::new(),
                needs_runtime_host: false,
            };
        }
    };

    if !recovered_errors.is_empty() {
        diagnostics.extend(
            recovered_errors
                .iter()
                .map(|error| parse_error_diagnostic(&cm, fm.start_pos, error)),
        );
        return TransformResult {
            code: source,
            diagnostics,
            changed: false,
            ir: Vec::new(),
            needs_runtime_host: false,
        };
    }

    let mut transformer = VelaTransformer {
        changed: false,
        config,
        diagnostics,
        ir: Vec::new(),
        runtime_host_needed: false,
        class_value_scopes: crate::class_value::scope::ClassValueScopeStack::default(),
    };
    module.visit_mut_with(&mut transformer);

    let emitted_code = emit::emit_module(&cm, &module).unwrap_or_else(|error| {
        transformer.diagnostics.push(Diagnostic {
            level: "error".to_owned(),
            code: "tsx-emit-failed".to_owned(),
            message: error,
            token: None,
            range: None,
        });
        source
    });

    TransformResult {
        code: emitted_code,
        diagnostics: transformer.diagnostics,
        changed: transformer.changed,
        ir: transformer
            .ir
            .into_iter()
            .map(|style| serde_json::to_string(&style).expect("style IR must serialize to JSON"))
            .collect(),
        needs_runtime_host: transformer.runtime_host_needed,
    }
}

#[cfg(test)]
mod tests {
    use super::transform_impl;
    use crate::api::TransformOptions;

    #[test]
    fn invalid_config_json_reports_a_diagnostic_and_uses_defaults() {
        let source = "const ui = <frame className=\"bg-slate-500\" />;".to_owned();
        let result = transform_impl(
            source,
            Some(TransformOptions {
                config_json: Some("{ not json".to_owned()),
            }),
        );

        let diagnostic = result
            .diagnostics
            .iter()
            .find(|diagnostic| diagnostic.code == "invalid-config-json")
            .expect("malformed configJson must be reported");
        assert_eq!(diagnostic.level, "error");
        assert!(result.changed, "compilation still proceeds with defaults");
    }

    #[test]
    fn parse_failure_reports_line_and_column() {
        let result = transform_impl("const broken = <frame\n  className=;".to_owned(), None);

        let diagnostic = result
            .diagnostics
            .iter()
            .find(|diagnostic| diagnostic.code == "tsx-parse-failed")
            .expect("broken TSX must be reported");
        assert!(
            diagnostic.message.contains("line 2"),
            "message should locate the error: {}",
            diagnostic.message
        );
        assert!(diagnostic.range.is_some(), "range should anchor the error");
    }

    fn element_ir(class_name: &str) -> String {
        let result = transform_impl(
            format!("const ui = <frame className=\"{class_name}\" />;"),
            None,
        );
        result
            .ir
            .into_iter()
            .next()
            .expect("the element must produce a style IR")
    }

    #[test]
    fn a_variant_color_clears_the_base_opacity_modifier() {
        let ir = element_ir("bg-blue-600/50 hover:bg-blue-600");
        let rules = ir
            .split_once("\"runtimeRules\"")
            .expect("the hover variant must survive as a runtime rule")
            .1;

        assert!(
            rules.contains("BackgroundTransparency"),
            "the variant must state the opaque value to override the base /50: {ir}"
        );
    }

    #[test]
    fn a_variant_color_leaves_opacity_alone_when_the_base_never_set_it() {
        let ir = element_ir("bg-blue-600 hover:bg-rose-500");

        assert!(
            !ir.contains("BackgroundTransparency"),
            "nothing set a transparency, so none should be emitted: {ir}"
        );
    }
}
