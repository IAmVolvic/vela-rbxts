use crate::api::Diagnostic;
use crate::config::model::{ColorValue, TailwindConfig};
use crate::diagnostics::compiler::{
    color_does_not_accept_shade_diagnostic, color_missing_shade_diagnostic,
    color_requires_shade_diagnostic, unknown_theme_key_diagnostic,
    unsupported_arbitrary_z_index_diagnostic, unsupported_color_keyword_diagnostic,
    unsupported_size_spacing_value_diagnostic, unsupported_z_index_auto_diagnostic,
    unsupported_z_index_value_diagnostic,
};
use crate::ir::model::SizeAxisValue;

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum PaddingKind {
    All,
    X,
    Y,
    Top,
    Right,
    Bottom,
    Left,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum UtilityKind {
    BackgroundColor,
    TextColor,
    ImageColor,
    PlaceholderColor,
    Border,
    Radius,
    ZIndex,
    Padding(PaddingKind),
    Gap,
    Width,
    Height,
    Size,
    Rotation,
    Opacity,
    AspectRatio,
    FlexDirection,
    JustifyContent,
    AlignItems,
    PositionX,
    PositionY,
    Inset,
    AnchorPoint,
    TextSize,
    FontWeight,
    TextXAlignment,
    TextYAlignment,
    TextWrap,
    TextTruncate,
    Visibility,
    Overflow,
    FlexWrap,
    MinWidth,
    MaxWidth,
    MinHeight,
    MaxHeight,
    ShadowSize,
    ShadowColor,
    GradientDirection,
    GradientFrom,
    GradientVia,
    GradientTo,
    Unknown,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct ColorFamilySpec {
    pub(crate) theme_family: &'static str,
    pub(crate) color_prop: &'static str,
    pub(crate) transparency_prop: Option<&'static str>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum ColorResolution {
    Expression(String),
    Transparent,
}

pub(crate) const BACKGROUND_COLOR_FAMILY: ColorFamilySpec = ColorFamilySpec {
    theme_family: "background color",
    color_prop: "BackgroundColor3",
    transparency_prop: Some("BackgroundTransparency"),
};

pub(crate) const TEXT_COLOR_FAMILY: ColorFamilySpec = ColorFamilySpec {
    theme_family: "text color",
    color_prop: "TextColor3",
    transparency_prop: Some("TextTransparency"),
};

pub(crate) const IMAGE_COLOR_FAMILY: ColorFamilySpec = ColorFamilySpec {
    theme_family: "image color",
    color_prop: "ImageColor3",
    transparency_prop: Some("ImageTransparency"),
};

pub(crate) const PLACEHOLDER_COLOR_FAMILY: ColorFamilySpec = ColorFamilySpec {
    theme_family: "placeholder color",
    color_prop: "PlaceholderColor3",
    transparency_prop: None,
};

pub(crate) const BORDER_COLOR_FAMILY: ColorFamilySpec = ColorFamilySpec {
    theme_family: "border color",
    color_prop: "Color",
    transparency_prop: Some("Transparency"),
};

pub(crate) const Z_INDEX_VALUES: [&str; 6] = ["0", "10", "20", "30", "40", "50"];
pub(crate) const BORDER_THICKNESS_VALUES: [&str; 4] = ["0", "1", "2", "4"];
pub(crate) const ROTATION_VALUES: [&str; 9] = ["0", "1", "2", "3", "6", "12", "45", "90", "180"];
pub(crate) const OPACITY_VALUES: [&str; 14] = [
    "0", "5", "10", "20", "25", "30", "40", "50", "60", "70", "75", "80", "90", "100",
];
pub(crate) const ASPECT_RATIO_VALUES: [&str; 2] = ["square", "video"];
pub(crate) const FLEX_DIRECTION_VALUES: [&str; 2] = ["row", "col"];
pub(crate) const ALIGNMENT_VALUES: [&str; 3] = ["start", "center", "end"];
pub(crate) const TEXT_SIZE_VALUES: [(&str, &str); 13] = [
    ("xs", "12"),
    ("sm", "14"),
    ("base", "16"),
    ("lg", "18"),
    ("xl", "20"),
    ("2xl", "24"),
    ("3xl", "30"),
    ("4xl", "36"),
    ("5xl", "48"),
    ("6xl", "60"),
    ("7xl", "72"),
    ("8xl", "96"),
    ("9xl", "128"),
];
pub(crate) const FONT_WEIGHT_VALUES: [(&str, &str); 9] = [
    ("thin", "Thin"),
    ("extralight", "ExtraLight"),
    ("light", "Light"),
    ("normal", "Regular"),
    ("medium", "Medium"),
    ("semibold", "SemiBold"),
    ("bold", "Bold"),
    ("extrabold", "ExtraBold"),
    ("black", "Heavy"),
];
pub(crate) const SHADOW_SIZE_VALUES: [&str; 6] = ["sm", "md", "lg", "xl", "2xl", "none"];
pub(crate) const GRADIENT_DIRECTION_VALUES: [&str; 8] =
    ["t", "tr", "r", "br", "b", "bl", "l", "tl"];
pub(crate) const GRADIENT_COLOR_FAMILY: ColorFamilySpec = ColorFamilySpec {
    theme_family: "gradient color",
    color_prop: "Color",
    transparency_prop: None,
};
pub(crate) const SHADOW_COLOR_FAMILY: ColorFamilySpec = ColorFamilySpec {
    theme_family: "shadow color",
    color_prop: "Color",
    transparency_prop: Some("Transparency"),
};
pub(crate) const TEXT_X_ALIGN_VALUES: [&str; 3] = ["left", "center", "right"];
pub(crate) const TEXT_Y_ALIGN_VALUES: [&str; 3] = ["top", "middle", "bottom"];
pub(crate) const TEXT_WRAP_VALUES: [&str; 2] = ["wrap", "nowrap"];
pub(crate) const DEFAULT_FONT_FAMILY: &str = "rbxasset://fonts/families/SourceSansPro.json";
pub(crate) const ANCHOR_ORIGIN_VALUES: [&str; 9] = [
    "top-left",
    "top",
    "top-right",
    "left",
    "center",
    "right",
    "bottom-left",
    "bottom",
    "bottom-right",
];

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ParsedUtility {
    pub(crate) raw: String,
    pub(crate) family: String,
    pub(crate) payload: Option<String>,
    pub(crate) kind: UtilityKind,
}

pub(crate) fn color_completion_keys(config: &TailwindConfig) -> Vec<String> {
    let mut keys = Vec::new();
    for (name, color) in &config.theme.colors {
        match color {
            ColorValue::Literal(_) => {
                push_unique(&mut keys, name.clone());
            }
            ColorValue::Palette(scale) => {
                for shade in scale.keys() {
                    push_unique(&mut keys, format!("{name}-{shade}"));
                }
            }
        }
    }
    keys
}

pub(crate) fn radius_completion_keys(config: &TailwindConfig) -> Vec<String> {
    config.theme.radius.keys().cloned().collect()
}

pub(crate) fn spacing_completion_keys(config: &TailwindConfig) -> Vec<String> {
    let mut keys = config.theme.spacing.keys().cloned().collect::<Vec<_>>();
    for key in [
        "0", "0.5", "1", "1.5", "2", "3", "4", "6", "8", "12", "16", "20", "24", "32", "40", "64",
        "80",
    ] {
        push_unique(&mut keys, key.to_owned());
    }
    keys
}

pub(crate) fn size_completion_keys(config: &TailwindConfig) -> Vec<String> {
    let mut keys = spacing_completion_keys(config);
    for key in [
        "px", "full", "auto", "fit", "1/2", "1/3", "2/3", "1/4", "3/4", "1/5", "2/5", "3/5", "4/5",
        "1/6", "5/6", "1/12", "5/12", "11/12",
    ] {
        push_unique(&mut keys, key.to_owned());
    }
    keys
}

pub(crate) fn is_automatic_size_key(key: &str) -> bool {
    matches!(key, "auto" | "fit")
}

pub(crate) fn position_completion_keys(config: &TailwindConfig) -> Vec<String> {
    let mut keys = spacing_completion_keys(config);
    for key in [
        "px", "full", "1/2", "1/3", "2/3", "1/4", "3/4", "1/5", "2/5", "3/5", "4/5",
    ] {
        push_unique(&mut keys, key.to_owned());
    }
    keys
}

impl UtilityKind {
    pub(crate) fn needs_config_lookup(&self) -> bool {
        matches!(
            self,
            UtilityKind::BackgroundColor
                | UtilityKind::TextColor
                | UtilityKind::ImageColor
                | UtilityKind::PlaceholderColor
                | UtilityKind::Border
                | UtilityKind::Radius
                | UtilityKind::Padding(_)
                | UtilityKind::Gap
                | UtilityKind::Width
                | UtilityKind::Height
                | UtilityKind::Size
                | UtilityKind::PositionX
                | UtilityKind::PositionY
                | UtilityKind::Inset
                | UtilityKind::MinWidth
                | UtilityKind::MaxWidth
                | UtilityKind::MinHeight
                | UtilityKind::MaxHeight
                | UtilityKind::ShadowColor
                | UtilityKind::GradientFrom
                | UtilityKind::GradientVia
                | UtilityKind::GradientTo
        )
    }

    pub(crate) fn is_supported(&self) -> bool {
        !matches!(self, UtilityKind::Unknown)
    }
}

pub(crate) fn is_utility_allowed_on_host(element_tag: &str, kind: &UtilityKind) -> bool {
    match kind {
        UtilityKind::TextColor
        | UtilityKind::TextSize
        | UtilityKind::FontWeight
        | UtilityKind::TextXAlignment
        | UtilityKind::TextYAlignment
        | UtilityKind::TextWrap
        | UtilityKind::TextTruncate => {
            matches!(element_tag, "textlabel" | "textbutton" | "textbox")
        }
        UtilityKind::ImageColor => matches!(element_tag, "imagelabel" | "imagebutton"),
        UtilityKind::PlaceholderColor => element_tag == "textbox",
        _ => true,
    }
}

pub(crate) fn parse_utility(token: &str) -> ParsedUtility {
    if token.starts_with("-z-") {
        return ParsedUtility {
            raw: token.to_owned(),
            family: "z".to_owned(),
            payload: token.strip_prefix("-z-").map(|value| value.to_owned()),
            kind: UtilityKind::ZIndex,
        };
    }

    if let Some(value) = token.strip_prefix("-rotate-") {
        return ParsedUtility {
            raw: token.to_owned(),
            family: "rotate".to_owned(),
            payload: Some(value.to_owned()),
            kind: UtilityKind::Rotation,
        };
    }

    for (prefix, family, kind) in [
        ("-top-", "top", UtilityKind::PositionY),
        ("-left-", "left", UtilityKind::PositionX),
        ("-inset-", "inset", UtilityKind::Inset),
    ] {
        if let Some(value) = token.strip_prefix(prefix) {
            return ParsedUtility {
                raw: token.to_owned(),
                family: family.to_owned(),
                payload: Some(value.to_owned()),
                kind,
            };
        }
    }

    if token == "border" {
        return ParsedUtility {
            raw: token.to_owned(),
            family: "border".to_owned(),
            payload: None,
            kind: UtilityKind::Border,
        };
    }

    if token == "truncate" {
        return ParsedUtility {
            raw: token.to_owned(),
            family: "truncate".to_owned(),
            payload: None,
            kind: UtilityKind::TextTruncate,
        };
    }

    if let Some(payload) = token.strip_prefix("text-") {
        return ParsedUtility {
            raw: token.to_owned(),
            family: "text".to_owned(),
            payload: Some(payload.to_owned()),
            kind: classify_text_utility(payload),
        };
    }

    for prefix in ["bg-gradient-to-", "bg-linear-to-"] {
        if let Some(dir) = token.strip_prefix(prefix) {
            return ParsedUtility {
                raw: token.to_owned(),
                family: "gradient".to_owned(),
                payload: Some(dir.to_owned()),
                kind: UtilityKind::GradientDirection,
            };
        }
    }

    if token == "shadow" {
        return ParsedUtility {
            raw: token.to_owned(),
            family: "shadow".to_owned(),
            payload: None,
            kind: UtilityKind::ShadowSize,
        };
    }

    if let Some(payload) = token.strip_prefix("shadow-") {
        return ParsedUtility {
            raw: token.to_owned(),
            family: "shadow".to_owned(),
            payload: Some(payload.to_owned()),
            kind: classify_shadow_utility(payload),
        };
    }

    if token == "flex" {
        return ParsedUtility {
            raw: token.to_owned(),
            family: "flex".to_owned(),
            payload: None,
            kind: UtilityKind::FlexDirection,
        };
    }

    if matches!(token, "flex-wrap" | "flex-nowrap") {
        return ParsedUtility {
            raw: token.to_owned(),
            family: "flex".to_owned(),
            payload: token.strip_prefix("flex-").map(|value| value.to_owned()),
            kind: UtilityKind::FlexWrap,
        };
    }

    if matches!(token, "hidden" | "visible") {
        return ParsedUtility {
            raw: token.to_owned(),
            family: token.to_owned(),
            payload: Some(token.to_owned()),
            kind: UtilityKind::Visibility,
        };
    }

    for (prefix, kind) in [
        ("bg-", UtilityKind::BackgroundColor),
        ("font-", UtilityKind::FontWeight),
        ("align-", UtilityKind::TextYAlignment),
        ("image-", UtilityKind::ImageColor),
        ("placeholder-", UtilityKind::PlaceholderColor),
        ("border-", UtilityKind::Border),
        ("rounded-", UtilityKind::Radius),
        ("z-", UtilityKind::ZIndex),
        ("p-", UtilityKind::Padding(PaddingKind::All)),
        ("px-", UtilityKind::Padding(PaddingKind::X)),
        ("py-", UtilityKind::Padding(PaddingKind::Y)),
        ("pt-", UtilityKind::Padding(PaddingKind::Top)),
        ("pr-", UtilityKind::Padding(PaddingKind::Right)),
        ("pb-", UtilityKind::Padding(PaddingKind::Bottom)),
        ("pl-", UtilityKind::Padding(PaddingKind::Left)),
        ("gap-", UtilityKind::Gap),
        ("min-w-", UtilityKind::MinWidth),
        ("max-w-", UtilityKind::MaxWidth),
        ("min-h-", UtilityKind::MinHeight),
        ("max-h-", UtilityKind::MaxHeight),
        ("w-", UtilityKind::Width),
        ("h-", UtilityKind::Height),
        ("size-", UtilityKind::Size),
        ("overflow-", UtilityKind::Overflow),
        ("rotate-", UtilityKind::Rotation),
        ("opacity-", UtilityKind::Opacity),
        ("aspect-", UtilityKind::AspectRatio),
        ("flex-", UtilityKind::FlexDirection),
        ("justify-", UtilityKind::JustifyContent),
        ("items-", UtilityKind::AlignItems),
        ("from-", UtilityKind::GradientFrom),
        ("via-", UtilityKind::GradientVia),
        ("to-", UtilityKind::GradientTo),
        ("top-", UtilityKind::PositionY),
        ("left-", UtilityKind::PositionX),
        ("inset-", UtilityKind::Inset),
        ("origin-", UtilityKind::AnchorPoint),
    ] {
        if let Some(payload) = token.strip_prefix(prefix) {
            return ParsedUtility {
                raw: token.to_owned(),
                family: prefix.trim_end_matches('-').to_owned(),
                payload: Some(payload.to_owned()),
                kind,
            };
        }
    }

    ParsedUtility {
        raw: token.to_owned(),
        family: token
            .split_once('-')
            .map(|(family, _)| family)
            .unwrap_or(token)
            .to_owned(),
        payload: token.split_once('-').map(|(_, payload)| payload.to_owned()),
        kind: UtilityKind::Unknown,
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct ShadowPreset {
    pub(crate) blur: u32,
    pub(crate) offset_y: u32,
    pub(crate) spread: i32,
    pub(crate) transparency: &'static str,
}

fn classify_shadow_utility(payload: &str) -> UtilityKind {
    if SHADOW_SIZE_VALUES.contains(&payload) || payload == "inner" {
        UtilityKind::ShadowSize
    } else {
        UtilityKind::ShadowColor
    }
}

pub(crate) fn resolve_gradient_rotation(direction: &str) -> Option<&'static str> {
    match direction {
        "r" => Some("0"),
        "br" => Some("45"),
        "b" => Some("90"),
        "bl" => Some("135"),
        "l" => Some("180"),
        "tl" => Some("225"),
        "t" => Some("270"),
        "tr" => Some("315"),
        _ => None,
    }
}

pub(crate) fn resolve_shadow_preset(key: Option<&str>) -> Option<ShadowPreset> {
    let (blur, offset_y, spread, transparency) = match key {
        None => (3, 1, 0, "0.9"),
        Some("sm") => (2, 1, 0, "0.95"),
        Some("md") => (6, 4, -1, "0.9"),
        Some("lg") => (15, 10, -3, "0.9"),
        Some("xl") => (25, 20, -5, "0.9"),
        Some("2xl") => (50, 25, -12, "0.75"),
        _ => return None,
    };

    Some(ShadowPreset {
        blur,
        offset_y,
        spread,
        transparency,
    })
}

fn classify_text_utility(payload: &str) -> UtilityKind {
    if TEXT_SIZE_VALUES.iter().any(|(key, _)| *key == payload) {
        UtilityKind::TextSize
    } else if TEXT_X_ALIGN_VALUES.contains(&payload) || payload == "justify" {
        UtilityKind::TextXAlignment
    } else if TEXT_WRAP_VALUES.contains(&payload) {
        UtilityKind::TextWrap
    } else {
        UtilityKind::TextColor
    }
}

pub(crate) fn resolve_text_size_value(key: &str) -> Option<&'static str> {
    TEXT_SIZE_VALUES
        .iter()
        .find(|(name, _)| *name == key)
        .map(|(_, value)| *value)
}

pub(crate) fn resolve_font_weight_value(key: &str) -> Option<String> {
    FONT_WEIGHT_VALUES
        .iter()
        .find(|(name, _)| *name == key)
        .map(|(_, weight)| {
            format!("new Font(\"{DEFAULT_FONT_FAMILY}\", Enum.FontWeight.{weight})")
        })
}

pub(crate) fn resolve_text_x_alignment_value(key: &str) -> Option<String> {
    let alignment = match key {
        "left" => "Enum.TextXAlignment.Left",
        "center" => "Enum.TextXAlignment.Center",
        "right" => "Enum.TextXAlignment.Right",
        _ => return None,
    };

    Some(alignment.to_owned())
}

pub(crate) fn resolve_text_y_alignment_value(key: &str) -> Option<String> {
    let alignment = match key {
        "top" => "Enum.TextYAlignment.Top",
        "middle" => "Enum.TextYAlignment.Center",
        "bottom" => "Enum.TextYAlignment.Bottom",
        _ => return None,
    };

    Some(alignment.to_owned())
}

pub(crate) fn resolve_text_wrap_value(key: &str) -> Option<&'static str> {
    match key {
        "wrap" => Some("true"),
        "nowrap" => Some("false"),
        _ => None,
    }
}

pub(crate) fn resolve_visibility_value(key: &str) -> Option<&'static str> {
    match key {
        "hidden" => Some("false"),
        "visible" => Some("true"),
        _ => None,
    }
}

pub(crate) fn resolve_overflow_value(key: &str) -> Option<&'static str> {
    match key {
        "hidden" | "clip" => Some("true"),
        "visible" => Some("false"),
        _ => None,
    }
}

pub(crate) fn resolve_flex_wrap_value(key: &str) -> Option<&'static str> {
    match key {
        "wrap" => Some("true"),
        "nowrap" => Some("false"),
        _ => None,
    }
}

pub(crate) fn resolve_border_thickness_value(payload: Option<&str>) -> Option<&'static str> {
    match payload {
        None => Some("1"),
        Some("0") => Some("0"),
        Some("1") => Some("1"),
        Some("2") => Some("2"),
        Some("4") => Some("4"),
        _ => None,
    }
}

pub(crate) fn is_known_unsupported_border_payload(payload: &str) -> bool {
    if payload.is_empty() {
        return false;
    }

    if matches!(payload, "dashed" | "solid" | "dotted" | "double") {
        return true;
    }

    if matches!(payload, "x" | "y" | "t" | "r" | "b" | "l") {
        return true;
    }

    if payload.starts_with("x-")
        || payload.starts_with("y-")
        || payload.starts_with("t-")
        || payload.starts_with("r-")
        || payload.starts_with("b-")
        || payload.starts_with("l-")
    {
        return true;
    }

    if payload.starts_with("opacity-") {
        return true;
    }

    if payload.starts_with('[') && payload.ends_with(']') {
        return true;
    }

    if payload.contains('/') {
        return true;
    }

    if payload.parse::<f64>().is_ok() {
        return !BORDER_THICKNESS_VALUES.contains(&payload);
    }

    false
}

pub(crate) fn resolve_color_value(
    config: &TailwindConfig,
    diagnostics: &mut Vec<Diagnostic>,
    spec: ColorFamilySpec,
    color_key: &str,
    token: &str,
) -> Option<ColorResolution> {
    if matches!(color_key, "current" | "inherit") {
        diagnostics.push(unsupported_color_keyword_diagnostic(
            spec.theme_family,
            color_key,
            token,
        ));
        return None;
    }

    if color_key == "transparent" {
        return Some(ColorResolution::Transparent);
    }

    match split_color_key(color_key) {
        ColorKey::Semantic(color_name) => match config.theme.colors.get(color_name) {
            Some(ColorValue::Literal(value)) => Some(ColorResolution::Expression(value.clone())),
            Some(ColorValue::Palette(_)) => {
                diagnostics.push(color_requires_shade_diagnostic(
                    spec.theme_family,
                    color_name,
                    token,
                ));
                None
            }
            None => {
                diagnostics.push(unknown_theme_key_diagnostic(
                    spec.theme_family,
                    color_key,
                    token,
                ));
                None
            }
        },
        ColorKey::Shaded { color_name, shade } => match config.theme.colors.get(color_name) {
            Some(ColorValue::Literal(_)) => {
                diagnostics.push(color_does_not_accept_shade_diagnostic(
                    spec.theme_family,
                    color_name,
                    shade,
                    token,
                ));
                None
            }
            Some(ColorValue::Palette(scale)) => match scale.get(shade) {
                Some(value) => Some(ColorResolution::Expression(value.clone())),
                None => {
                    diagnostics.push(color_missing_shade_diagnostic(
                        spec.theme_family,
                        color_name,
                        shade,
                        token,
                    ));
                    None
                }
            },
            None => {
                diagnostics.push(unknown_theme_key_diagnostic(
                    spec.theme_family,
                    color_key,
                    token,
                ));
                None
            }
        },
    }
}

pub(crate) fn resolve_radius_value(config: &TailwindConfig, key: &str) -> Option<String> {
    config.theme.radius.get(key).cloned()
}

pub(crate) fn resolve_spacing_value(config: &TailwindConfig, key: &str) -> Option<String> {
    config
        .theme
        .spacing
        .get(key)
        .cloned()
        .or_else(|| resolve_numeric_spacing_value(key))
}

pub(crate) fn resolve_size_axis_value(
    config: &TailwindConfig,
    diagnostics: &mut Vec<Diagnostic>,
    size_key: &str,
    token: &str,
) -> Option<SizeAxisValue> {
    if size_key == "px" {
        return Some(SizeAxisValue::offset("1"));
    }

    if size_key == "full" {
        return Some(SizeAxisValue::scale("1"));
    }

    if let Some(fraction) = resolve_size_fraction_scale(size_key) {
        return Some(SizeAxisValue::scale(fraction));
    }

    resolve_size_spacing_offset(config, diagnostics, size_key, token).map(SizeAxisValue::offset)
}

pub(crate) fn resolve_position_axis_value(
    config: &TailwindConfig,
    diagnostics: &mut Vec<Diagnostic>,
    position_key: &str,
    token: &str,
    negative: bool,
) -> Option<SizeAxisValue> {
    let base = if position_key == "px" {
        SizeAxisValue::offset("1")
    } else if position_key == "full" {
        SizeAxisValue::scale("1")
    } else if let Some(fraction) = resolve_size_fraction_scale(position_key) {
        SizeAxisValue::scale(fraction)
    } else {
        SizeAxisValue::offset(resolve_size_spacing_offset(
            config,
            diagnostics,
            position_key,
            token,
        )?)
    };

    Some(if negative { negate_size_axis(base) } else { base })
}

pub(crate) fn resolve_anchor_point_value(key: &str) -> Option<String> {
    let (x, y) = match key {
        "top-left" => ("0", "0"),
        "top" => ("0.5", "0"),
        "top-right" => ("1", "0"),
        "left" => ("0", "0.5"),
        "center" => ("0.5", "0.5"),
        "right" => ("1", "0.5"),
        "bottom-left" => ("0", "1"),
        "bottom" => ("0.5", "1"),
        "bottom-right" => ("1", "1"),
        _ => return None,
    };

    Some(format!("new Vector2({x}, {y})"))
}

fn negate_size_axis(value: SizeAxisValue) -> SizeAxisValue {
    SizeAxisValue {
        scale: negate_number(value.scale),
        offset: negate_number(value.offset),
    }
}

fn negate_number(value: String) -> String {
    if value == "0" {
        value
    } else if let Some(rest) = value.strip_prefix('-') {
        rest.to_owned()
    } else {
        format!("-{value}")
    }
}

pub(crate) fn resolve_size_spacing_offset(
    config: &TailwindConfig,
    diagnostics: &mut Vec<Diagnostic>,
    spacing_key: &str,
    token: &str,
) -> Option<String> {
    let Some(value) = resolve_spacing_value(config, spacing_key) else {
        diagnostics.push(unknown_theme_key_diagnostic("spacing", spacing_key, token));
        return None;
    };

    if let Some(offset) = spacing_value_to_offset(&value) {
        return Some(offset);
    }

    diagnostics.push(unsupported_size_spacing_value_diagnostic(&value, token));
    None
}

pub(crate) fn resolve_size_fraction_scale(key: &str) -> Option<String> {
    let (numerator, denominator) = key.split_once('/')?;
    let numerator = numerator.parse::<u32>().ok()?;
    let denominator = denominator.parse::<u32>().ok()?;

    let is_supported = match denominator {
        2 => numerator == 1,
        3 => matches!(numerator, 1 | 2),
        4 => matches!(numerator, 1 | 3),
        5 => matches!(numerator, 1 | 2 | 3 | 4),
        6 => matches!(numerator, 1 | 5),
        12 => (1..=11).contains(&numerator),
        _ => false,
    };

    if !is_supported {
        return None;
    }

    Some(format_fraction_scale(numerator, denominator))
}

pub(crate) fn resolve_z_index_value(
    z_key: &str,
    token: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> Option<String> {
    if z_key == "auto" {
        diagnostics.push(unsupported_z_index_auto_diagnostic(token));
        return None;
    }

    if z_key.starts_with('[') && z_key.ends_with(']') {
        diagnostics.push(unsupported_arbitrary_z_index_diagnostic(token));
        return None;
    }

    if Z_INDEX_VALUES.contains(&z_key) {
        return Some(z_key.to_owned());
    }

    if z_key.parse::<i32>().is_ok() {
        diagnostics.push(unsupported_z_index_value_diagnostic(z_key, token));
        return None;
    }

    diagnostics.push(unsupported_z_index_value_diagnostic(z_key, token));
    None
}

pub(crate) fn resolve_rotation_value(degrees: &str, negative: bool) -> Option<String> {
    if !ROTATION_VALUES.contains(&degrees) {
        return None;
    }

    if negative && degrees != "0" {
        return Some(format!("-{degrees}"));
    }

    Some(degrees.to_owned())
}

pub(crate) fn resolve_opacity_value(percent: &str) -> Option<String> {
    let percent = percent.parse::<u32>().ok()?;
    if percent > 100 {
        return None;
    }

    Some(format_transparency(100 - percent))
}

pub(crate) fn resolve_aspect_ratio_value(key: &str) -> Option<String> {
    let ratio = match key {
        "square" => 1.0,
        "video" => 16.0 / 9.0,
        _ => parse_arbitrary_aspect_ratio(key)?,
    };

    Some(format_ratio(ratio))
}

pub(crate) fn resolve_flex_direction_value(key: Option<&str>) -> Option<String> {
    match key {
        None | Some("row") => Some("Enum.FillDirection.Horizontal".to_owned()),
        Some("col") => Some("Enum.FillDirection.Vertical".to_owned()),
        _ => None,
    }
}

pub(crate) fn resolve_justify_value(key: &str) -> Option<String> {
    let alignment = match key {
        "start" => "Enum.HorizontalAlignment.Left",
        "center" => "Enum.HorizontalAlignment.Center",
        "end" => "Enum.HorizontalAlignment.Right",
        _ => return None,
    };

    Some(alignment.to_owned())
}

pub(crate) fn resolve_align_items_value(key: &str) -> Option<String> {
    let alignment = match key {
        "start" => "Enum.VerticalAlignment.Top",
        "center" => "Enum.VerticalAlignment.Center",
        "end" => "Enum.VerticalAlignment.Bottom",
        _ => return None,
    };

    Some(alignment.to_owned())
}

fn parse_arbitrary_aspect_ratio(key: &str) -> Option<f64> {
    let inner = key.strip_prefix('[')?.strip_suffix(']')?;

    if let Some((width, height)) = inner.split_once('/') {
        let width = width.trim().parse::<f64>().ok()?;
        let height = height.trim().parse::<f64>().ok()?;
        if !width.is_finite() || !height.is_finite() || width <= 0.0 || height <= 0.0 {
            return None;
        }

        return Some(width / height);
    }

    let value = inner.trim().parse::<f64>().ok()?;
    if !value.is_finite() || value <= 0.0 {
        return None;
    }

    Some(value)
}

fn format_transparency(remainder: u32) -> String {
    if remainder == 0 {
        return "0".to_owned();
    }

    if remainder >= 100 {
        return "1".to_owned();
    }

    if remainder % 10 == 0 {
        return format!("0.{}", remainder / 10);
    }

    format!("0.{remainder:02}")
}

fn format_ratio(value: f64) -> String {
    let rounded = value.round();
    if (value - rounded).abs() < 1e-9 {
        return format!("{rounded:.0}");
    }

    format!("{value:.10}")
        .trim_end_matches('0')
        .trim_end_matches('.')
        .to_owned()
}

pub(crate) enum ColorKey<'a> {
    Semantic(&'a str),
    Shaded { color_name: &'a str, shade: &'a str },
}

pub(crate) fn split_color_key(key: &str) -> ColorKey<'_> {
    let Some((name, shade)) = key.rsplit_once('-') else {
        return ColorKey::Semantic(key);
    };

    if is_shade_token(shade) {
        return ColorKey::Shaded {
            color_name: name,
            shade,
        };
    }

    ColorKey::Semantic(key)
}

pub(crate) fn is_shade_token(value: &str) -> bool {
    matches!(
        value,
        "50" | "100" | "200" | "300" | "400" | "500" | "600" | "700" | "800" | "900" | "950"
    )
}

fn resolve_numeric_spacing_value(key: &str) -> Option<String> {
    if matches!(key.as_bytes().first(), Some(b'-') | Some(b'+')) {
        return None;
    }

    let numeric_key = key.parse::<f64>().ok()?;
    if !numeric_key.is_finite() || numeric_key < 0.0 {
        return None;
    }

    let half_step_units = numeric_key * 2.0;
    if !half_step_units.is_finite() || !is_whole_number(half_step_units) {
        return None;
    }

    let offset_px = numeric_key * 4.0;
    if !offset_px.is_finite() {
        return None;
    }

    Some(format!("new UDim(0, {})", format_spacing_offset(offset_px)))
}

fn spacing_value_to_offset(value: &str) -> Option<String> {
    let args = value.trim().strip_prefix("new UDim(")?.strip_suffix(')')?;

    let mut parts = args.split(',');
    let scale = parts.next()?.trim().parse::<f64>().ok()?;
    let offset = parts.next()?.trim().parse::<f64>().ok()?;
    if parts.next().is_some() || !scale.is_finite() || !offset.is_finite() {
        return None;
    }

    if scale.abs() >= 1e-9 {
        return None;
    }

    Some(format_spacing_offset(offset))
}

fn is_whole_number(value: f64) -> bool {
    let rounded = value.round();
    (value - rounded).abs() < 1e-9
}

fn format_spacing_offset(value: f64) -> String {
    let rounded = value.round();
    if (value - rounded).abs() < 1e-9 {
        return format!("{rounded:.0}");
    }

    value.to_string()
}

fn format_fraction_scale(numerator: u32, denominator: u32) -> String {
    let value = numerator as f64 / denominator as f64;
    let rounded = value.round();
    if (value - rounded).abs() < 1e-9 {
        return format!("{rounded:.0}");
    }

    format!("{value:.10}")
        .trim_end_matches('0')
        .trim_end_matches('.')
        .to_owned()
}

fn push_unique(values: &mut Vec<String>, value: String) {
    if !values.iter().any(|existing| existing == &value) {
        values.push(value);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::model::TailwindConfig;

    #[test]
    fn host_allowlist_matches_utility_family() {
        assert!(is_utility_allowed_on_host(
            "textbox",
            &UtilityKind::PlaceholderColor
        ));
        assert!(!is_utility_allowed_on_host(
            "frame",
            &UtilityKind::TextColor
        ));
        assert!(is_utility_allowed_on_host(
            "frame",
            &UtilityKind::BackgroundColor
        ));
    }

    #[test]
    fn resolves_shared_semantic_values() {
        let config = TailwindConfig::default();

        let mut diagnostics = Vec::new();
        assert_eq!(
            resolve_z_index_value("10", "z-10", &mut diagnostics),
            Some("10".to_owned())
        );
        assert_eq!(diagnostics.len(), 0);

        assert_eq!(
            resolve_spacing_value(&config, "4"),
            Some("new UDim(0, 16)".to_owned())
        );
    }

    #[test]
    fn resolves_rotation_opacity_and_aspect_values() {
        assert_eq!(resolve_rotation_value("45", false), Some("45".to_owned()));
        assert_eq!(resolve_rotation_value("90", true), Some("-90".to_owned()));
        assert_eq!(resolve_rotation_value("0", true), Some("0".to_owned()));
        assert_eq!(resolve_rotation_value("17", false), None);

        assert_eq!(resolve_opacity_value("0"), Some("1".to_owned()));
        assert_eq!(resolve_opacity_value("50"), Some("0.5".to_owned()));
        assert_eq!(resolve_opacity_value("25"), Some("0.75".to_owned()));
        assert_eq!(resolve_opacity_value("95"), Some("0.05".to_owned()));
        assert_eq!(resolve_opacity_value("100"), Some("0".to_owned()));
        assert_eq!(resolve_opacity_value("101"), None);
        assert_eq!(resolve_opacity_value("half"), None);

        assert_eq!(resolve_aspect_ratio_value("square"), Some("1".to_owned()));
        assert_eq!(
            resolve_aspect_ratio_value("video"),
            Some("1.7777777778".to_owned())
        );
        assert_eq!(
            resolve_aspect_ratio_value("[4/3]"),
            Some("1.3333333333".to_owned())
        );
        assert_eq!(resolve_aspect_ratio_value("[3]"), Some("3".to_owned()));
        assert_eq!(resolve_aspect_ratio_value("auto"), None);
        assert_eq!(resolve_aspect_ratio_value("[1/0]"), None);
    }

    #[test]
    fn resolves_position_and_anchor_values() {
        let config = TailwindConfig::default();
        let mut diagnostics = Vec::new();

        let offset = resolve_position_axis_value(&config, &mut diagnostics, "4", "left-4", false)
            .expect("spacing offset");
        assert_eq!(offset.scale, "0");
        assert_eq!(offset.offset, "16");

        let negative =
            resolve_position_axis_value(&config, &mut diagnostics, "4", "-top-4", true).unwrap();
        assert_eq!(negative.offset, "-16");

        let half = resolve_position_axis_value(&config, &mut diagnostics, "1/2", "left-1/2", false)
            .unwrap();
        assert_eq!(half.scale, "0.5");
        assert_eq!(half.offset, "0");

        let negative_half =
            resolve_position_axis_value(&config, &mut diagnostics, "1/2", "-left-1/2", true)
                .unwrap();
        assert_eq!(negative_half.scale, "-0.5");
        assert_eq!(diagnostics.len(), 0);

        assert_eq!(
            resolve_anchor_point_value("center"),
            Some("new Vector2(0.5, 0.5)".to_owned())
        );
        assert_eq!(
            resolve_anchor_point_value("bottom-right"),
            Some("new Vector2(1, 1)".to_owned())
        );
        assert_eq!(resolve_anchor_point_value("middle"), None);
    }

    #[test]
    fn classifies_and_resolves_text_utilities() {
        assert!(matches!(parse_utility("text-lg").kind, UtilityKind::TextSize));
        assert!(matches!(
            parse_utility("text-center").kind,
            UtilityKind::TextXAlignment
        ));
        assert!(matches!(
            parse_utility("text-nowrap").kind,
            UtilityKind::TextWrap
        ));
        assert!(matches!(
            parse_utility("text-red-500").kind,
            UtilityKind::TextColor
        ));
        assert!(matches!(
            parse_utility("text-transparent").kind,
            UtilityKind::TextColor
        ));
        assert!(matches!(
            parse_utility("font-bold").kind,
            UtilityKind::FontWeight
        ));
        assert!(matches!(
            parse_utility("align-middle").kind,
            UtilityKind::TextYAlignment
        ));
        assert!(matches!(
            parse_utility("truncate").kind,
            UtilityKind::TextTruncate
        ));

        assert_eq!(resolve_text_size_value("2xl"), Some("24"));
        assert_eq!(resolve_text_size_value("huge"), None);
        assert_eq!(
            resolve_font_weight_value("bold"),
            Some(format!(
                "new Font(\"{DEFAULT_FONT_FAMILY}\", Enum.FontWeight.Bold)"
            ))
        );
        assert_eq!(
            resolve_text_x_alignment_value("center"),
            Some("Enum.TextXAlignment.Center".to_owned())
        );
        assert_eq!(resolve_text_x_alignment_value("justify"), None);
        assert_eq!(
            resolve_text_y_alignment_value("bottom"),
            Some("Enum.TextYAlignment.Bottom".to_owned())
        );
        assert_eq!(resolve_text_wrap_value("nowrap"), Some("false"));
    }

    #[test]
    fn restricts_text_utilities_to_text_hosts() {
        assert!(is_utility_allowed_on_host(
            "textlabel",
            &UtilityKind::TextSize
        ));
        assert!(!is_utility_allowed_on_host("frame", &UtilityKind::TextSize));
        assert!(!is_utility_allowed_on_host(
            "frame",
            &UtilityKind::FontWeight
        ));
    }

    #[test]
    fn parses_position_families() {
        assert!(matches!(
            parse_utility("left-4").kind,
            UtilityKind::PositionX
        ));
        assert!(matches!(parse_utility("top-4").kind, UtilityKind::PositionY));
        assert!(matches!(parse_utility("inset-0").kind, UtilityKind::Inset));
        let negative = parse_utility("-left-4");
        assert!(matches!(negative.kind, UtilityKind::PositionX));
        assert_eq!(negative.payload.as_deref(), Some("4"));
        assert!(matches!(
            parse_utility("origin-center").kind,
            UtilityKind::AnchorPoint
        ));
    }

    #[test]
    fn resolves_layout_enum_values() {
        assert_eq!(
            resolve_flex_direction_value(None),
            Some("Enum.FillDirection.Horizontal".to_owned())
        );
        assert_eq!(
            resolve_flex_direction_value(Some("col")),
            Some("Enum.FillDirection.Vertical".to_owned())
        );
        assert_eq!(resolve_flex_direction_value(Some("row-reverse")), None);

        assert_eq!(
            resolve_justify_value("center"),
            Some("Enum.HorizontalAlignment.Center".to_owned())
        );
        assert_eq!(resolve_justify_value("between"), None);

        assert_eq!(
            resolve_align_items_value("end"),
            Some("Enum.VerticalAlignment.Bottom".to_owned())
        );
        assert_eq!(resolve_align_items_value("stretch"), None);
    }

    #[test]
    fn parses_rotation_and_layout_families() {
        assert!(matches!(
            parse_utility("rotate-45").kind,
            UtilityKind::Rotation
        ));
        let negative = parse_utility("-rotate-90");
        assert!(matches!(negative.kind, UtilityKind::Rotation));
        assert_eq!(negative.payload.as_deref(), Some("90"));

        assert!(matches!(
            parse_utility("flex").kind,
            UtilityKind::FlexDirection
        ));
        assert!(matches!(
            parse_utility("flex-col").kind,
            UtilityKind::FlexDirection
        ));
        assert!(matches!(
            parse_utility("justify-center").kind,
            UtilityKind::JustifyContent
        ));
        assert!(matches!(
            parse_utility("items-end").kind,
            UtilityKind::AlignItems
        ));
        assert!(matches!(
            parse_utility("opacity-50").kind,
            UtilityKind::Opacity
        ));
        assert!(matches!(
            parse_utility("aspect-video").kind,
            UtilityKind::AspectRatio
        ));
    }

    #[test]
    fn parses_and_resolves_state_utilities() {
        assert!(matches!(
            parse_utility("hidden").kind,
            UtilityKind::Visibility
        ));
        assert!(matches!(
            parse_utility("visible").kind,
            UtilityKind::Visibility
        ));
        assert!(matches!(
            parse_utility("overflow-hidden").kind,
            UtilityKind::Overflow
        ));
        assert!(matches!(
            parse_utility("flex-wrap").kind,
            UtilityKind::FlexWrap
        ));
        assert!(matches!(
            parse_utility("flex-col").kind,
            UtilityKind::FlexDirection
        ));
        assert!(matches!(
            parse_utility("min-w-40").kind,
            UtilityKind::MinWidth
        ));
        assert!(matches!(
            parse_utility("max-h-40").kind,
            UtilityKind::MaxHeight
        ));

        assert_eq!(resolve_visibility_value("hidden"), Some("false"));
        assert_eq!(resolve_visibility_value("visible"), Some("true"));
        assert_eq!(resolve_overflow_value("clip"), Some("true"));
        assert_eq!(resolve_overflow_value("scroll"), None);
        assert_eq!(resolve_flex_wrap_value("nowrap"), Some("false"));

        let config = TailwindConfig::default();
        let mut diagnostics = Vec::new();
        assert_eq!(
            resolve_size_spacing_offset(&config, &mut diagnostics, "40", "min-w-40"),
            Some("160".to_owned())
        );
        assert_eq!(diagnostics.len(), 0);
    }

    #[test]
    fn classifies_and_resolves_gradient_utilities() {
        assert!(matches!(
            parse_utility("bg-gradient-to-r").kind,
            UtilityKind::GradientDirection
        ));
        assert!(matches!(
            parse_utility("bg-linear-to-br").kind,
            UtilityKind::GradientDirection
        ));
        assert!(matches!(
            parse_utility("from-cyan-500").kind,
            UtilityKind::GradientFrom
        ));
        assert!(matches!(
            parse_utility("via-purple-500").kind,
            UtilityKind::GradientVia
        ));
        assert!(matches!(
            parse_utility("to-blue-500").kind,
            UtilityKind::GradientTo
        ));
        assert!(matches!(
            parse_utility("bg-red-500").kind,
            UtilityKind::BackgroundColor
        ));

        assert_eq!(resolve_gradient_rotation("r"), Some("0"));
        assert_eq!(resolve_gradient_rotation("b"), Some("90"));
        assert_eq!(resolve_gradient_rotation("tl"), Some("225"));
        assert_eq!(resolve_gradient_rotation("nope"), None);
    }

    #[test]
    fn classifies_and_resolves_shadow_utilities() {
        assert!(matches!(parse_utility("shadow").kind, UtilityKind::ShadowSize));
        assert!(matches!(
            parse_utility("shadow-lg").kind,
            UtilityKind::ShadowSize
        ));
        assert!(matches!(
            parse_utility("shadow-none").kind,
            UtilityKind::ShadowSize
        ));
        assert!(matches!(
            parse_utility("shadow-inner").kind,
            UtilityKind::ShadowSize
        ));
        assert!(matches!(
            parse_utility("shadow-red-500").kind,
            UtilityKind::ShadowColor
        ));

        let base = resolve_shadow_preset(None).unwrap();
        assert_eq!(base.blur, 3);
        assert_eq!(base.offset_y, 1);
        assert_eq!(base.transparency, "0.9");

        let two_xl = resolve_shadow_preset(Some("2xl")).unwrap();
        assert_eq!(two_xl.blur, 50);
        assert_eq!(two_xl.spread, -12);
        assert_eq!(two_xl.transparency, "0.75");

        assert!(resolve_shadow_preset(Some("none")).is_none());
        assert!(resolve_shadow_preset(Some("inner")).is_none());
    }

    #[test]
    fn recognizes_automatic_size_keys() {
        assert!(is_automatic_size_key("auto"));
        assert!(is_automatic_size_key("fit"));
        assert!(!is_automatic_size_key("full"));
        assert!(!is_automatic_size_key("4"));
    }
}
