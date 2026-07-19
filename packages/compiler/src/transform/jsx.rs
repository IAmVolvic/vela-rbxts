use crate::api::{Diagnostic, EditorRange};
use crate::class_value::collapse::collapse_class_value_expr;
use crate::class_value::scope::ClassValueScopeStack;
use crate::editor::ClassToken;
use crate::ir::model::{StyleEffectBundle, StyleIr};
use crate::transform::runtime::resolve_class_tokens;
use swc_core::ecma::ast::{
    JSXAttr, JSXAttrOrSpread, JSXAttrValue, JSXElementName, JSXExpr, JSXExprContainer,
};

pub(crate) struct LoweredClassName {
    pub(crate) style_ir: StyleIr,
    pub(crate) preserved_attrs: Vec<JSXAttrOrSpread>,
    pub(crate) runtime_class_name: Option<JSXAttr>,
    pub(crate) needs_runtime_host: bool,
}

pub(crate) fn lower_class_name(
    attrs: &[JSXAttrOrSpread],
    config: &crate::config::model::TailwindConfig,
    scopes: &ClassValueScopeStack,
    diagnostics: &mut Vec<Diagnostic>,
) -> Option<LoweredClassName> {
    let class_name_attr = attrs.iter().find_map(|attr| match attr {
        JSXAttrOrSpread::JSXAttr(attr) if is_class_name_attr(&attr.name) => Some(attr),
        _ => None,
    })?;

    let preserved_attrs = attrs
        .iter()
        .filter(|attr| {
            !matches!(
                attr,
                JSXAttrOrSpread::JSXAttr(attr) if is_class_name_attr(&attr.name)
            )
        })
        .cloned()
        .collect();

    match &class_name_attr.value {
        Some(JSXAttrValue::Str(value)) => {
            let class_name = value.value.to_string_lossy().into_owned();
            // `span.lo` sits on the opening quote, so it is also the offset of the first
            // value byte once the source map's leading byte is subtracted.
            let value_offset = value.span.lo.0;
            let spans = crate::editor::tokenize_class_name_with_ranges(&class_name, value_offset);
            let diagnostics_before = diagnostics.len();
            let style = resolve_class_tokens(
                spans.iter().map(|token| token.text.as_str()),
                config,
                diagnostics,
            );
            attach_token_ranges(&mut diagnostics[diagnostics_before..], &spans);
            let needs_runtime_host = !style.runtime_rules.is_empty() || style.runtime_class_value;

            Some(LoweredClassName {
                style_ir: style,
                preserved_attrs,
                runtime_class_name: None,
                needs_runtime_host,
            })
        }
        Some(JSXAttrValue::JSXExprContainer(container)) => {
            let JSXExpr::Expr(expr) = &container.expr else {
                return Some(LoweredClassName {
                    style_ir: StyleIr {
                        base: StyleEffectBundle::default(),
                        runtime_rules: Vec::new(),
                        runtime_class_value: true,
                    },
                    preserved_attrs,
                    runtime_class_name: Some(class_name_attr.clone()),
                    needs_runtime_host: true,
                });
            };

            let collapse = collapse_class_value_expr(expr, scopes);
            let runtime_class_value = collapse.is_dynamic();
            let style = resolve_class_tokens(collapse.static_tokens.clone(), config, diagnostics);
            let needs_runtime_host = !style.runtime_rules.is_empty() || runtime_class_value;
            let runtime_class_name = collapse.dynamic_expr.map(|expr| {
                let mut runtime_attr = class_name_attr.clone();
                runtime_attr.value = Some(JSXAttrValue::JSXExprContainer(JSXExprContainer {
                    span: container.span,
                    expr: JSXExpr::Expr(expr),
                }));
                runtime_attr
            });

            Some(LoweredClassName {
                style_ir: StyleIr {
                    runtime_class_value,
                    ..style
                },
                preserved_attrs,
                runtime_class_name,
                needs_runtime_host,
            })
        }
        _ => Some(LoweredClassName {
            style_ir: StyleIr {
                base: StyleEffectBundle::default(),
                runtime_rules: Vec::new(),
                runtime_class_value: true,
            },
            preserved_attrs,
            runtime_class_name: Some(class_name_attr.clone()),
            needs_runtime_host: true,
        }),
    }
}

fn attach_token_ranges(diagnostics: &mut [Diagnostic], spans: &[ClassToken]) {
    for diagnostic in diagnostics {
        if diagnostic.range.is_some() {
            continue;
        }

        let Some(token) = diagnostic.token.as_deref() else {
            continue;
        };

        if let Some(span) = spans.iter().find(|span| span.text == token) {
            diagnostic.range = Some(span.range.clone());
        }
    }
}

/// Reports `className` on host elements the transformer never lowers, so it does
/// not silently reach the runtime as an unknown Roblox property.
pub(crate) fn unsupported_host_class_name_diagnostic(
    name: &JSXElementName,
    attrs: &[JSXAttrOrSpread],
) -> Option<Diagnostic> {
    let class_name_attr = find_class_name_attr(attrs)?;
    let element = element_display_name(name);

    Some(Diagnostic {
        level: "warning".to_owned(),
        code: "classname-on-unsupported-host".to_owned(),
        message: format!(
            "`className` on `{element}` is not lowered; supported host elements are frame, scrollingframe, canvasgroup, textlabel, textbutton, textbox, imagelabel, and imagebutton."
        ),
        token: None,
        range: class_name_value_range(class_name_attr),
    })
}

/// Components receive statically resolved props, so anything that would need the
/// runtime host cannot be lowered into them.
pub(crate) fn runtime_class_name_on_component_diagnostic(
    name: &JSXElementName,
    attrs: &[JSXAttrOrSpread],
) -> Option<Diagnostic> {
    let class_name_attr = find_class_name_attr(attrs)?;
    let element = element_display_name(name);

    Some(Diagnostic {
        level: "warning".to_owned(),
        code: "runtime-classname-on-component".to_owned(),
        message: format!(
            "`className` on component `{element}` must resolve statically; dynamic expressions and runtime variants such as `sm:` are only lowered on Roblox host elements."
        ),
        token: None,
        range: class_name_value_range(class_name_attr),
    })
}

fn find_class_name_attr(attrs: &[JSXAttrOrSpread]) -> Option<&JSXAttr> {
    attrs.iter().find_map(|attr| match attr {
        JSXAttrOrSpread::JSXAttr(attr) if is_class_name_attr(&attr.name) => Some(attr),
        _ => None,
    })
}

fn class_name_value_range(attr: &JSXAttr) -> Option<EditorRange> {
    match &attr.value {
        // `span.lo` is the opening quote and `span.hi` is one past the closing
        // quote, so the value itself sits between them.
        Some(JSXAttrValue::Str(value)) => Some(EditorRange {
            start: value.span.lo.0,
            end: value.span.hi.0.saturating_sub(2),
        }),
        _ => None,
    }
}

fn element_display_name(name: &JSXElementName) -> String {
    match name {
        JSXElementName::Ident(ident) => ident.sym.to_string(),
        JSXElementName::JSXMemberExpr(member) => member.prop.sym.to_string(),
        JSXElementName::JSXNamespacedName(namespaced) => namespaced.name.sym.to_string(),
    }
}

pub(crate) fn is_component_element(name: &JSXElementName) -> bool {
    match name {
        JSXElementName::Ident(ident) => ident.sym.chars().next().is_some_and(char::is_uppercase),
        JSXElementName::JSXMemberExpr(_) => true,
        JSXElementName::JSXNamespacedName(_) => false,
    }
}

fn is_class_name_attr(name: &swc_core::ecma::ast::JSXAttrName) -> bool {
    matches!(name, swc_core::ecma::ast::JSXAttrName::Ident(ident) if ident.sym == "className")
}
