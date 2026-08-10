// Parts of this vocabulary are read only by the editor, which the wasm
// binding leaves out; the native build still checks them for real dead code.
#![cfg_attr(target_arch = "wasm32", allow(dead_code))]

use crate::ir::model::RuntimeCondition;

/// Runtime variant names paired with the condition they check, phrased for
/// editor documentation. Keep the widths in sync with `parse_variant_prefix`.
pub(crate) const RUNTIME_VARIANTS: [(&str, &str); 12] = [
    ("sm", "the viewport is at least 640px wide"),
    ("md", "the viewport is at least 768px wide"),
    ("lg", "the viewport is at least 1024px wide"),
    ("portrait", "the viewport is taller than it is wide"),
    ("landscape", "the viewport is wider than it is tall"),
    ("touch", "the last input was touch"),
    ("mouse", "the last input was a mouse or keyboard"),
    ("gamepad", "the last input was a gamepad"),
    ("hover", "the pointer is over the element"),
    ("active", "the element is being pressed"),
    ("focus", "the element holds input focus"),
    ("dark", "the player's color scheme is dark"),
];

pub(crate) fn variant_condition(prefix: &str) -> Option<&'static str> {
    RUNTIME_VARIANTS
        .iter()
        .find(|(name, _)| *name == prefix)
        .map(|(_, condition)| *condition)
}

/// "sm, md, ..., and hover" for diagnostics, so the message tracks the table.
pub(crate) fn supported_variant_list() -> String {
    let (last, rest) = RUNTIME_VARIANTS
        .split_last()
        .expect("RUNTIME_VARIANTS is never empty");
    let rest = rest.iter().map(|(name, _)| *name).collect::<Vec<_>>();

    format!("{}, and {}", rest.join(", "), last.0)
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum VariantKind {
    Width {
        alias: String,
        min_width: u32,
        max_width: Option<u32>,
    },
    Orientation {
        value: String,
    },
    Input {
        value: String,
    },
    ColorScheme {
        value: String,
    },
    Hover,
    Active,
    Focus,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ParsedVariant {
    pub(crate) raw: String,
    /// `None` for a prefix that is not a vela-rbxts runtime variant.
    pub(crate) kind: Option<VariantKind>,
}

impl ParsedVariant {
    pub(crate) fn runtime_condition(&self) -> Option<RuntimeCondition> {
        Some(match self.kind.as_ref()? {
            VariantKind::Width {
                alias,
                min_width,
                max_width,
            } => RuntimeCondition::Width {
                alias: alias.clone(),
                min_width: *min_width,
                max_width: *max_width,
            },
            VariantKind::Orientation { value } => RuntimeCondition::Orientation {
                value: value.clone(),
            },
            VariantKind::Input { value } => RuntimeCondition::Input {
                value: value.clone(),
            },
            VariantKind::ColorScheme { value } => RuntimeCondition::ColorScheme {
                value: value.clone(),
            },
            VariantKind::Hover => RuntimeCondition::Hover,
            VariantKind::Active => RuntimeCondition::Active,
            VariantKind::Focus => RuntimeCondition::Focus,
        })
    }
}

pub(crate) fn parse_variant_prefix(prefix: &str) -> Option<VariantKind> {
    match prefix {
        "sm" => Some(VariantKind::Width {
            alias: "sm".to_owned(),
            min_width: 640,
            max_width: None,
        }),
        "md" => Some(VariantKind::Width {
            alias: "md".to_owned(),
            min_width: 768,
            max_width: None,
        }),
        "lg" => Some(VariantKind::Width {
            alias: "lg".to_owned(),
            min_width: 1024,
            max_width: None,
        }),
        "portrait" => Some(VariantKind::Orientation {
            value: "portrait".to_owned(),
        }),
        "landscape" => Some(VariantKind::Orientation {
            value: "landscape".to_owned(),
        }),
        "touch" => Some(VariantKind::Input {
            value: "touch".to_owned(),
        }),
        "mouse" => Some(VariantKind::Input {
            value: "mouse".to_owned(),
        }),
        "gamepad" => Some(VariantKind::Input {
            value: "gamepad".to_owned(),
        }),
        "dark" => Some(VariantKind::ColorScheme {
            value: "dark".to_owned(),
        }),
        "hover" => Some(VariantKind::Hover),
        "active" => Some(VariantKind::Active),
        "focus" => Some(VariantKind::Focus),
        _ => None,
    }
}

/// Splits every `prefix:` segment off the token. Unrecognised prefixes are kept
/// as variants with no kind so the utility behind them still gets analyzed and
/// the unknown prefix can be reported on its own.
pub(crate) fn split_variant_prefixes(token: &str) -> (Vec<ParsedVariant>, &str) {
    let mut variants = Vec::new();
    let mut remainder = token;

    while let Some(index) = top_level_colon(remainder) {
        let prefix = &remainder[..index];
        variants.push(ParsedVariant {
            raw: prefix.to_owned(),
            kind: parse_variant_prefix(prefix),
        });
        remainder = &remainder[index + 1..];
    }

    (variants, remainder)
}

/// Colons inside `[...]` belong to an arbitrary value, not a variant separator.
fn top_level_colon(token: &str) -> Option<usize> {
    let mut depth = 0usize;

    for (index, ch) in token.char_indices() {
        match ch {
            '[' | '(' => depth += 1,
            ']' | ')' => depth = depth.saturating_sub(1),
            ':' if depth == 0 => return Some(index),
            _ => {}
        }
    }

    None
}
