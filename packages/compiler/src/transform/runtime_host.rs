use crate::config::model::{MotionDriverConfig, TailwindConfig};
use crate::swc::parse::parse_module_items;
use swc_core::ecma::ast::ModuleItem;

/// The runtime lives in `packages/runtime` so it is real, typechecked source
/// rather than a string this crate can never compile. It is read, not imported:
/// importing it would make every consumer install a package and map it into
/// their Rojo tree.
const RUNTIME_SOURCE: &str = include_str!("../../../runtime/src/index.ts");

pub(crate) fn create_runtime_host_module_items(config: &TailwindConfig) -> Vec<ModuleItem> {
    let config_json = serde_json::to_string(config).expect("runtime config must serialize to JSON");
    let (motion_import, motion_argument) = motion_driver_source(config.plugins.motion.as_ref());
    let runtime = partition_runtime_source(RUNTIME_SOURCE);

    // Luau caps a function at 200 local registers, and the module body is a
    // function. Inlined at module scope the runtime spent ~96 of them before a
    // component declared anything, so a file with enough of its own parts
    // failed to compile at all. Everything with a runtime value goes inside one
    // initializer instead; types stay outside because they cost no register and
    // the host cast names one of them.
    let source = format!(
        "{motion_import}{imports}\n{types}\nconst __VelaRuntimeConfig = {config_json};\nconst VelaRuntimeHost = (() => {{\n{values}\nreturn createVelaRuntimeHost(__VelaRuntimeConfig{motion_argument});\n}})() as unknown as VelaRuntimeHostComponent;",
        imports = runtime.imports,
        types = runtime.types,
        values = runtime.values,
    );
    let items = parse_module_items(&source);

    assert!(!items.is_empty(), "inline runtime helper source must parse");

    items
}

struct RuntimeSourceParts {
    imports: String,
    types: String,
    values: String,
}

/// Splits the runtime into what must stay at module scope and what can be
/// scoped away. Imports cannot appear inside a function, and types are erased
/// before Luau ever sees them, so only value declarations are worth moving.
///
/// A declaration runs from its own keyword to the next one at column zero. The
/// runtime is formatter-normalized, so nested code is always indented and only
/// a real top-level declaration can match — which keeps multi-line type unions
/// and wrapped function signatures in one piece.
fn partition_runtime_source(source: &str) -> RuntimeSourceParts {
    let mut imports = String::new();
    let mut types = String::new();
    let mut values = String::new();

    let lines: Vec<&str> = source.lines().collect();
    let mut index = 0;

    while index < lines.len() {
        let head = lines[index];
        let start = index;
        index += 1;

        while index < lines.len() && !starts_declaration(lines[index]) {
            index += 1;
        }

        let block = lines[start..index].join("\n");
        let target = if head.starts_with("import ") {
            &mut imports
        } else if is_type_declaration(head) {
            &mut types
        } else {
            &mut values
        };

        target.push_str(&block);
        target.push('\n');
    }

    // `export` has no meaning once these are locals in one file, and the
    // package's re-export list describes a public surface that does not exist
    // here at all.
    RuntimeSourceParts {
        imports,
        types: strip_type_reexports(&types),
        values: values.replace("export function ", "function "),
    }
}

fn strip_type_reexports(types: &str) -> String {
    types
        .lines()
        .filter(|line| !line.starts_with("export type {"))
        .collect::<Vec<_>>()
        .join("\n")
}

fn starts_declaration(line: &str) -> bool {
    const KEYWORDS: [&str; 7] = [
        "import ",
        "type ",
        "interface ",
        "declare ",
        "function ",
        "const ",
        "let ",
    ];

    let head = line.strip_prefix("export ").unwrap_or(line);
    KEYWORDS.iter().any(|keyword| head.starts_with(keyword))
}

fn is_type_declaration(line: &str) -> bool {
    let head = line.strip_prefix("export ").unwrap_or(line);
    head.starts_with("type ") || head.starts_with("interface ") || head.starts_with("declare ")
}

/// The import that brings a configured motion driver in, and the argument that
/// hands it to the runtime. Without one the argument is empty, so every method
/// falls back to the built-in TweenService path.
fn motion_driver_source(motion: Option<&MotionDriverConfig>) -> (String, String) {
    let Some(motion) = motion else {
        return (String::new(), String::new());
    };

    let module = escape_module_specifier(&motion.module);
    let import = match &motion.export_name {
        Some(name) => {
            format!("import {{ {name} as __VelaMotionDriverSource }} from \"{module}\";\n")
        }
        None => format!("import __VelaMotionDriverSource from \"{module}\";\n"),
    };

    (import, ", __VelaMotionDriverSource".to_owned())
}

/// The specifier reaches the emitted module inside a string literal, so a quote
/// or a newline in it would otherwise end the literal early.
fn escape_module_specifier(module: &str) -> String {
    module
        .chars()
        .filter(|value| !value.is_control())
        .map(|value| match value {
            '"' => "\\\"".to_owned(),
            '\\' => "\\\\".to_owned(),
            other => other.to_string(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use crate::semantic::utility::UTILITY_PREFIXES;

    /// Read rather than embedded: the runtime ships as its own package now, and
    /// this is the seam that would otherwise let the two drift apart unnoticed.
    const RUNTIME_SOURCE: &str = include_str!("../../../runtime/src/index.ts");

    /// forwardRef alone pins one ref type for every tag, which types every
    /// consumer ref as `unknown`; the generic restatement is what keeps `ref`
    /// following the lowered host tag.
    #[test]
    fn the_runtime_host_types_its_ref_from_the_host_tag() {
        assert!(
            RUNTIME_SOURCE.contains("ref?: __VelaReact.Ref<VelaRefTarget<Tag>>"),
            "the host component type must derive its ref from the tag"
        );
    }

    /// A family the static path lowers but the runtime host never matches is
    /// silent: a `className` that arrives as a value simply renders without it.
    #[test]
    fn the_runtime_host_matches_every_static_utility_prefix() {
        for (prefix, _) in UTILITY_PREFIXES {
            assert!(
                RUNTIME_SOURCE.contains(&format!("\"{prefix}\"")),
                "runtime host never matches the \"{prefix}\" family"
            );
        }
    }
}
