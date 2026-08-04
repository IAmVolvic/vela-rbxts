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
    // function. The runtime's helpers are grouped into namespaces, which lower
    // to `local Group = {} do ... end` — one register each, with the members
    // freed at the block's end — so they stay at module scope. Only the host
    // factory needs the initializer; types stay outside because they cost no
    // register and the host cast names one of them.
    let source = format!(
        "{motion_import}{imports}\n{types}\n{namespaces}\nconst __VelaRuntimeConfig = {config_json};\nconst VelaRuntimeHost = (() => {{\n{values}\nreturn createVelaRuntimeHost(__VelaRuntimeConfig{motion_argument});\n}})() as unknown as VelaRuntimeHostComponent;",
        imports = runtime.imports,
        types = runtime.types,
        namespaces = runtime.namespaces,
        values = runtime.values,
    );
    let items = parse_module_items(&source);

    assert!(!items.is_empty(), "inline runtime helper source must parse");

    items
}

/// A file can need the fade without needing the host: a component whose root is
/// lowered statically still has to consume the alpha its caller provides, and a
/// static element still has to hand one to the component below it. Only the
/// opacity namespace is inlined there — it depends on React and nothing else.
pub(crate) fn create_opacity_module_items() -> Vec<ModuleItem> {
    let import = extract_declaration(RUNTIME_SOURCE, "import __VelaReact ")
        .expect("the runtime must import React");
    let namespace = extract_declaration(
        RUNTIME_SOURCE,
        &format!("namespace {} ", crate::swc::builders::OPACITY_NAMESPACE),
    )
    .expect("the runtime must declare the opacity namespace");

    let items = parse_module_items(&format!("{import}\n{namespace}"));

    assert!(!items.is_empty(), "inline opacity helper source must parse");

    items
}

/// One top-level declaration, from its own keyword to the next one at column
/// zero — the same shape `partition_runtime_source` reads the file in.
fn extract_declaration(source: &str, head: &str) -> Option<String> {
    let lines: Vec<&str> = source.lines().collect();
    let start = lines.iter().position(|line| line.starts_with(head))?;
    let end = lines[start + 1..]
        .iter()
        .position(|line| starts_declaration(line))
        .map_or(lines.len(), |offset| start + 1 + offset);

    Some(lines[start..end].join("\n"))
}

struct RuntimeSourceParts {
    imports: String,
    types: String,
    namespaces: String,
    values: String,
}

/// Splits the runtime into what must stay at module scope and what can be
/// scoped away. Imports cannot appear inside a function, types are erased
/// before Luau ever sees them, and a namespace already scopes its own members,
/// so only loose value declarations are worth moving.
///
/// A declaration runs from its own keyword to the next one at column zero. The
/// runtime is formatter-normalized, so nested code is always indented and only
/// a real top-level declaration can match — which keeps multi-line type unions,
/// wrapped function signatures, and whole namespace bodies in one piece.
fn partition_runtime_source(source: &str) -> RuntimeSourceParts {
    let mut imports = String::new();
    let mut types = String::new();
    let mut namespaces = String::new();
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
        } else if is_namespace_declaration(head) {
            &mut namespaces
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
        namespaces,
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
    const KEYWORDS: [&str; 8] = [
        "import ",
        "type ",
        "interface ",
        "declare ",
        "namespace ",
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

fn is_namespace_declaration(line: &str) -> bool {
    let head = line.strip_prefix("export ").unwrap_or(line);
    head.starts_with("namespace ")
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

    /// Luau caps a function at 200 local registers and the emitted module body
    /// is a function, so every runtime declaration that survives to module scope
    /// is one the consumer's own file can no longer spend. The budget leaves
    /// room both for the emitter's prelude and for the file being compiled.
    const REGISTER_BUDGET: usize = 120;

    /// The three scopes the emitter produces: module scope holds one register
    /// per namespace, a namespace body holds its members until its block ends,
    /// and the initializer holds whatever was left loose at the top level.
    #[test]
    fn the_inlined_runtime_stays_inside_luau_s_local_register_budget() {
        let mut namespaces: Vec<(String, usize)> = Vec::new();
        let mut loose = 0;

        for line in RUNTIME_SOURCE.lines() {
            let head = line.strip_prefix("export ").unwrap_or(line);

            if let Some(rest) = head.strip_prefix("namespace ") {
                let name = rest.trim_end_matches(" {").to_owned();
                namespaces.push((name, 0));
            } else if super::starts_declaration(line) && !super::is_type_declaration(line) {
                loose += 1;
            } else if let Some(member) = line.strip_prefix('\t') {
                let member = member.strip_prefix("export ").unwrap_or(member);
                if super::starts_declaration(member)
                    && !super::is_type_declaration(member)
                    && let Some(last) = namespaces.last_mut()
                {
                    last.1 += 1;
                }
            }
        }

        // The initializer keeps the loose declarations, and module scope keeps
        // one register per namespace plus the config and the host itself.
        let module_scope = namespaces.len() + 2;
        assert!(
            module_scope <= REGISTER_BUDGET,
            "module scope needs {module_scope} registers, over the {REGISTER_BUDGET} budget"
        );
        assert!(
            loose <= REGISTER_BUDGET,
            "the runtime initializer needs {loose} registers, over the {REGISTER_BUDGET} budget"
        );

        for (name, members) in &namespaces {
            // roblox-ts adds a container local alongside the members.
            let peak = module_scope + members + 1;
            assert!(
                peak <= REGISTER_BUDGET,
                "namespace {name} peaks at {peak} registers, over the {REGISTER_BUDGET} budget"
            );
        }

        assert!(
            namespaces.len() > 1,
            "the runtime must stay grouped into namespaces"
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
