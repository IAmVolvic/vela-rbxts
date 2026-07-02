use crate::api::Diagnostic;
use crate::config::model::TailwindConfig;
use crate::diagnostics::compiler::{
    negative_z_index_diagnostic, unknown_theme_key_diagnostic, unsupported_alignment_value_diagnostic,
    unsupported_anchor_value_diagnostic, unsupported_arbitrary_z_index_diagnostic,
    unsupported_aspect_value_diagnostic, unsupported_border_value_diagnostic,
    unsupported_color_keyword_diagnostic, unsupported_flex_direction_diagnostic,
    unsupported_font_weight_diagnostic, unsupported_gradient_direction_diagnostic,
    unsupported_opacity_value_diagnostic, unsupported_overflow_diagnostic,
    unsupported_rotation_value_diagnostic,
    unsupported_shadow_inset_diagnostic, unsupported_text_alignment_diagnostic,
    unsupported_text_size_diagnostic, unsupported_utility_family_diagnostic,
    unsupported_z_index_auto_diagnostic, unsupported_z_index_value_diagnostic,
};
use crate::ir::model::{RuntimeRule, SizeAxisValue, StyleIr};
use crate::semantic::{
    analyze::analyze_class_token,
    result::{AnalyzedClassToken, SemanticIssue},
    utility::{
        BACKGROUND_COLOR_FAMILY, BORDER_COLOR_FAMILY, ColorResolution, GRADIENT_COLOR_FAMILY,
        IMAGE_COLOR_FAMILY, PLACEHOLDER_COLOR_FAMILY, PaddingKind, SHADOW_COLOR_FAMILY,
        ShadowPreset, TEXT_COLOR_FAMILY, UtilityKind, is_automatic_size_key,
        is_known_unsupported_border_payload, resolve_align_items_value, resolve_anchor_point_value,
        resolve_aspect_ratio_value, resolve_border_thickness_value, resolve_color_value,
        resolve_gradient_rotation,
        resolve_flex_direction_value, resolve_flex_wrap_value, resolve_font_weight_value,
        resolve_justify_value, resolve_opacity_value, resolve_overflow_value,
        resolve_position_axis_value, resolve_radius_value, resolve_rotation_value,
        resolve_shadow_preset, resolve_size_axis_value, resolve_size_spacing_offset,
        resolve_spacing_value, resolve_text_size_value, resolve_text_wrap_value,
        resolve_text_x_alignment_value, resolve_text_y_alignment_value, resolve_visibility_value,
        resolve_z_index_value,
    },
};

pub(crate) fn resolve_class_tokens<T, I>(
    tokens: I,
    config: &TailwindConfig,
    diagnostics: &mut Vec<Diagnostic>,
) -> StyleIr
where
    I: IntoIterator<Item = T>,
    T: AsRef<str>,
{
    let mut style = StyleIr::default();
    let mut pending = PendingAxes::default();

    for token in tokens {
        let analysis = analyze_class_token(token.as_ref());
        debug_assert_eq!(analysis.static_only, !analysis.runtime_aware);

        if analysis.runtime_aware {
            let condition = analysis
                .runtime_condition
                .clone()
                .expect("runtime-aware analysis must carry a runtime condition");
            let runtime_style = resolve_single_analyzed_token(&analysis, config, diagnostics);
            if !runtime_style.base.props.is_empty() || !runtime_style.base.helpers.is_empty() {
                style.runtime_rules.push(RuntimeRule {
                    condition,
                    effects: runtime_style.base,
                });
            }
            continue;
        }

        apply_analyzed_token(&analysis, config, diagnostics, &mut style, &mut pending);
    }

    pending.flush(&mut style);
    style
}

#[derive(Default)]
struct PendingAxes {
    size_width: Option<SizeAxisValue>,
    size_height: Option<SizeAxisValue>,
    position_x: Option<SizeAxisValue>,
    position_y: Option<SizeAxisValue>,
    auto_x: bool,
    auto_y: bool,
    min_width: Option<String>,
    min_height: Option<String>,
    max_width: Option<String>,
    max_height: Option<String>,
    gradient_rotation: Option<&'static str>,
    gradient_from: Option<String>,
    gradient_via: Option<String>,
    gradient_to: Option<String>,
}

impl PendingAxes {
    fn flush(self, style: &mut StyleIr) {
        if self.size_width.is_some() || self.size_height.is_some() {
            style.set_prop("Size", format_udim2_prop(self.size_width, self.size_height));
        }

        if self.position_x.is_some() || self.position_y.is_some() {
            style.set_prop(
                "Position",
                format_udim2_prop(self.position_x, self.position_y),
            );
        }

        if let Some(axis) = automatic_size_axis(self.auto_x, self.auto_y) {
            style.set_prop("AutomaticSize", format!("Enum.AutomaticSize.{axis}"));
        }

        if self.min_width.is_some() || self.min_height.is_some() {
            let x = self.min_width.unwrap_or_else(|| "0".to_owned());
            let y = self.min_height.unwrap_or_else(|| "0".to_owned());
            style.set_helper_prop("uisizeconstraint", "MinSize", format!("new Vector2({x}, {y})"));
        }

        if self.max_width.is_some() || self.max_height.is_some() {
            let x = self.max_width.unwrap_or_else(|| "math.huge".to_owned());
            let y = self.max_height.unwrap_or_else(|| "math.huge".to_owned());
            style.set_helper_prop("uisizeconstraint", "MaxSize", format!("new Vector2({x}, {y})"));
        }

        let stops: Vec<String> = [self.gradient_from, self.gradient_via, self.gradient_to]
            .into_iter()
            .flatten()
            .collect();
        if !stops.is_empty() {
            style.set_helper_prop("uigradient", "Color", color_sequence_expr(&stops));
            if let Some(rotation) = self.gradient_rotation.filter(|rotation| *rotation != "0") {
                style.set_helper_prop("uigradient", "Rotation", rotation.to_owned());
            }
            // UIGradient modulates BackgroundColor3, so force a white base for true stop colors.
            style.set_prop("BackgroundColor3", "Color3.fromRGB(255, 255, 255)".to_owned());
        }
    }
}

fn color_sequence_expr(stops: &[String]) -> String {
    match stops {
        [single] => format!("new ColorSequence({single})"),
        [start, end] => format!("new ColorSequence({start}, {end})"),
        _ => {
            let last = stops.len() - 1;
            let keypoints = stops
                .iter()
                .enumerate()
                .map(|(index, color)| {
                    let position = format_stop_position(index as f64 / last as f64);
                    format!("new ColorSequenceKeypoint({position}, {color})")
                })
                .collect::<Vec<_>>()
                .join(", ");
            format!("new ColorSequence([{keypoints}])")
        }
    }
}

fn format_stop_position(value: f64) -> String {
    let rounded = value.round();
    if (value - rounded).abs() < 1e-9 {
        return format!("{rounded:.0}");
    }

    format!("{value:.4}")
        .trim_end_matches('0')
        .trim_end_matches('.')
        .to_owned()
}

fn automatic_size_axis(x: bool, y: bool) -> Option<&'static str> {
    match (x, y) {
        (true, true) => Some("XY"),
        (true, false) => Some("X"),
        (false, true) => Some("Y"),
        (false, false) => None,
    }
}

fn resolve_single_analyzed_token(
    analysis: &AnalyzedClassToken,
    config: &TailwindConfig,
    diagnostics: &mut Vec<Diagnostic>,
) -> StyleIr {
    let mut style = StyleIr::default();
    let mut pending = PendingAxes::default();
    apply_analyzed_token(analysis, config, diagnostics, &mut style, &mut pending);
    pending.flush(&mut style);
    style
}

fn apply_analyzed_token(
    analysis: &AnalyzedClassToken,
    config: &TailwindConfig,
    diagnostics: &mut Vec<Diagnostic>,
    style: &mut StyleIr,
    pending: &mut PendingAxes,
) {
    let _needs_config_lookup = analysis.needs_config_lookup;

    if !analysis.supported {
        for issue in &analysis.issues {
            match issue {
                SemanticIssue::UnsupportedUtilityFamily { .. } => {
                    diagnostics.push(unsupported_utility_family_diagnostic(&analysis.parsed.raw));
                    return;
                }
                SemanticIssue::UnsupportedZIndexValue { value } => {
                    diagnostics.push(unsupported_z_index_value_diagnostic(
                        value,
                        &analysis.parsed.raw,
                    ));
                    return;
                }
                SemanticIssue::UnsupportedZIndexAuto => {
                    diagnostics.push(unsupported_z_index_auto_diagnostic(&analysis.parsed.raw));
                    return;
                }
                SemanticIssue::UnsupportedArbitraryZIndex => {
                    diagnostics.push(unsupported_arbitrary_z_index_diagnostic(
                        &analysis.parsed.raw,
                    ));
                    return;
                }
                SemanticIssue::NegativeZIndex => {
                    diagnostics.push(negative_z_index_diagnostic(&analysis.parsed.raw));
                    return;
                }
                SemanticIssue::UnsupportedBorderValue { value } => {
                    diagnostics.push(unsupported_border_value_diagnostic(
                        value,
                        &analysis.parsed.raw,
                    ));
                    return;
                }
            }
        }
    }

    match &analysis.utility {
        UtilityKind::BackgroundColor => {
            if let Some(color_key) = analysis.payload() {
                apply_color_utility(
                    style,
                    config,
                    diagnostics,
                    BACKGROUND_COLOR_FAMILY,
                    color_key,
                    &analysis.parsed.raw,
                );
            }
        }
        UtilityKind::TextColor => {
            if let Some(color_key) = analysis.payload() {
                apply_color_utility(
                    style,
                    config,
                    diagnostics,
                    TEXT_COLOR_FAMILY,
                    color_key,
                    &analysis.parsed.raw,
                );
            }
        }
        UtilityKind::ImageColor => {
            if let Some(color_key) = analysis.payload() {
                apply_color_utility(
                    style,
                    config,
                    diagnostics,
                    IMAGE_COLOR_FAMILY,
                    color_key,
                    &analysis.parsed.raw,
                );
            }
        }
        UtilityKind::PlaceholderColor => {
            if let Some(color_key) = analysis.payload() {
                apply_color_utility(
                    style,
                    config,
                    diagnostics,
                    PLACEHOLDER_COLOR_FAMILY,
                    color_key,
                    &analysis.parsed.raw,
                );
            }
        }
        UtilityKind::Border => {
            if let Some(border_key) = analysis.payload() {
                apply_border_utility(style, config, diagnostics, border_key, &analysis.parsed.raw);
            } else if let Some(value) = resolve_border_thickness_value(None) {
                style.set_helper_prop("uistroke", "Thickness", value.to_owned());
            }
        }
        UtilityKind::Radius => {
            if let Some(radius_key) = analysis.payload() {
                if let Some(value) = resolve_radius_value(config, radius_key) {
                    style.set_helper_prop("uicorner", "CornerRadius", value);
                } else {
                    diagnostics.push(unknown_theme_key_diagnostic(
                        "radius",
                        radius_key,
                        &analysis.parsed.raw,
                    ));
                }
            }
        }
        UtilityKind::ZIndex => {
            if let Some(z_key) = analysis.payload() {
                if let Some(value) = resolve_z_index_value(z_key, &analysis.parsed.raw, diagnostics)
                {
                    style.set_prop("ZIndex", value);
                }
            }
        }
        UtilityKind::Padding(axis) => {
            if let Some(spacing_key) = analysis.payload() {
                apply_spacing_utility(
                    style,
                    config,
                    diagnostics,
                    spacing_key,
                    &analysis.parsed.raw,
                    axis,
                );
            }
        }
        UtilityKind::Gap => {
            if let Some(spacing_key) = analysis.payload() {
                apply_gap_utility(
                    style,
                    config,
                    diagnostics,
                    spacing_key,
                    &analysis.parsed.raw,
                );
            }
        }
        UtilityKind::Width => {
            if let Some(size_key) = analysis.payload() {
                if is_automatic_size_key(size_key) {
                    pending.auto_x = true;
                } else {
                    pending.size_width = resolve_size_axis_value(
                        config,
                        diagnostics,
                        size_key,
                        &analysis.parsed.raw,
                    );
                }
            }
        }
        UtilityKind::Height => {
            if let Some(size_key) = analysis.payload() {
                if is_automatic_size_key(size_key) {
                    pending.auto_y = true;
                } else {
                    pending.size_height = resolve_size_axis_value(
                        config,
                        diagnostics,
                        size_key,
                        &analysis.parsed.raw,
                    );
                }
            }
        }
        UtilityKind::Size => {
            if let Some(size_key) = analysis.payload() {
                if is_automatic_size_key(size_key) {
                    pending.auto_x = true;
                    pending.auto_y = true;
                } else {
                    let value = resolve_size_axis_value(
                        config,
                        diagnostics,
                        size_key,
                        &analysis.parsed.raw,
                    );
                    pending.size_width = value.clone();
                    pending.size_height = value;
                }
            }
        }
        UtilityKind::PositionX => {
            if let Some(position_key) = analysis.payload() {
                let negative = analysis.parsed.raw.starts_with("-left-");
                pending.position_x = resolve_position_axis_value(
                    config,
                    diagnostics,
                    position_key,
                    &analysis.parsed.raw,
                    negative,
                );
            }
        }
        UtilityKind::PositionY => {
            if let Some(position_key) = analysis.payload() {
                let negative = analysis.parsed.raw.starts_with("-top-");
                pending.position_y = resolve_position_axis_value(
                    config,
                    diagnostics,
                    position_key,
                    &analysis.parsed.raw,
                    negative,
                );
            }
        }
        UtilityKind::Inset => {
            if let Some(position_key) = analysis.payload() {
                let negative = analysis.parsed.raw.starts_with("-inset-");
                let value = resolve_position_axis_value(
                    config,
                    diagnostics,
                    position_key,
                    &analysis.parsed.raw,
                    negative,
                );
                pending.position_x = value.clone();
                pending.position_y = value;
            }
        }
        UtilityKind::AnchorPoint => {
            if let Some(origin_key) = analysis.payload() {
                if let Some(value) = resolve_anchor_point_value(origin_key) {
                    style.set_prop("AnchorPoint", value);
                } else {
                    diagnostics.push(unsupported_anchor_value_diagnostic(
                        origin_key,
                        &analysis.parsed.raw,
                    ));
                }
            }
        }
        UtilityKind::Rotation => {
            if let Some(degrees) = analysis.payload() {
                let negative = analysis.parsed.utility.raw.starts_with("-rotate-");
                if let Some(value) = resolve_rotation_value(degrees, negative) {
                    style.set_prop("Rotation", value);
                } else {
                    diagnostics.push(unsupported_rotation_value_diagnostic(
                        degrees,
                        &analysis.parsed.raw,
                    ));
                }
            }
        }
        UtilityKind::Opacity => {
            if let Some(percent) = analysis.payload() {
                if let Some(value) = resolve_opacity_value(percent) {
                    style.set_prop("BackgroundTransparency", value);
                } else {
                    diagnostics.push(unsupported_opacity_value_diagnostic(
                        percent,
                        &analysis.parsed.raw,
                    ));
                }
            }
        }
        UtilityKind::AspectRatio => {
            if let Some(ratio_key) = analysis.payload() {
                if let Some(value) = resolve_aspect_ratio_value(ratio_key) {
                    style.set_helper_prop("uiaspectratioconstraint", "AspectRatio", value);
                } else {
                    diagnostics.push(unsupported_aspect_value_diagnostic(
                        ratio_key,
                        &analysis.parsed.raw,
                    ));
                }
            }
        }
        UtilityKind::FlexDirection => {
            if let Some(value) = resolve_flex_direction_value(analysis.payload()) {
                style.set_helper_prop("uilistlayout", "FillDirection", value);
            } else {
                diagnostics.push(unsupported_flex_direction_diagnostic(
                    analysis.payload().unwrap_or_default(),
                    &analysis.parsed.raw,
                ));
            }
        }
        UtilityKind::JustifyContent => {
            if let Some(alignment_key) = analysis.payload() {
                if let Some(value) = resolve_justify_value(alignment_key) {
                    style.set_helper_prop("uilistlayout", "HorizontalAlignment", value);
                } else {
                    diagnostics.push(unsupported_alignment_value_diagnostic(
                        "justify",
                        alignment_key,
                        &analysis.parsed.raw,
                    ));
                }
            }
        }
        UtilityKind::AlignItems => {
            if let Some(alignment_key) = analysis.payload() {
                if let Some(value) = resolve_align_items_value(alignment_key) {
                    style.set_helper_prop("uilistlayout", "VerticalAlignment", value);
                } else {
                    diagnostics.push(unsupported_alignment_value_diagnostic(
                        "items",
                        alignment_key,
                        &analysis.parsed.raw,
                    ));
                }
            }
        }
        UtilityKind::TextSize => {
            if let Some(size_key) = analysis.payload() {
                if let Some(value) = resolve_text_size_value(size_key) {
                    style.set_prop("TextSize", value.to_owned());
                } else {
                    diagnostics
                        .push(unsupported_text_size_diagnostic(size_key, &analysis.parsed.raw));
                }
            }
        }
        UtilityKind::FontWeight => {
            if let Some(weight_key) = analysis.payload() {
                if let Some(value) = resolve_font_weight_value(weight_key) {
                    style.set_prop("FontFace", value);
                } else {
                    diagnostics.push(unsupported_font_weight_diagnostic(
                        weight_key,
                        &analysis.parsed.raw,
                    ));
                }
            }
        }
        UtilityKind::TextXAlignment => {
            if let Some(alignment_key) = analysis.payload() {
                if let Some(value) = resolve_text_x_alignment_value(alignment_key) {
                    style.set_prop("TextXAlignment", value);
                } else {
                    diagnostics.push(unsupported_text_alignment_diagnostic(
                        "text",
                        alignment_key,
                        &analysis.parsed.raw,
                    ));
                }
            }
        }
        UtilityKind::TextYAlignment => {
            if let Some(alignment_key) = analysis.payload() {
                if let Some(value) = resolve_text_y_alignment_value(alignment_key) {
                    style.set_prop("TextYAlignment", value);
                } else {
                    diagnostics.push(unsupported_text_alignment_diagnostic(
                        "align",
                        alignment_key,
                        &analysis.parsed.raw,
                    ));
                }
            }
        }
        UtilityKind::TextWrap => {
            if let Some(value) = analysis.payload().and_then(resolve_text_wrap_value) {
                style.set_prop("TextWrapped", value.to_owned());
            }
        }
        UtilityKind::TextTruncate => {
            style.set_prop("TextTruncate", "Enum.TextTruncate.AtEnd".to_owned());
        }
        UtilityKind::Visibility => {
            if let Some(value) = analysis.payload().and_then(resolve_visibility_value) {
                style.set_prop("Visible", value.to_owned());
            }
        }
        UtilityKind::Overflow => {
            if let Some(overflow_key) = analysis.payload() {
                if let Some(value) = resolve_overflow_value(overflow_key) {
                    style.set_prop("ClipsDescendants", value.to_owned());
                } else {
                    diagnostics
                        .push(unsupported_overflow_diagnostic(overflow_key, &analysis.parsed.raw));
                }
            }
        }
        UtilityKind::FlexWrap => {
            if let Some(value) = analysis.payload().and_then(resolve_flex_wrap_value) {
                style.set_helper_prop("uilistlayout", "Wraps", value.to_owned());
            }
        }
        UtilityKind::MinWidth => {
            if let Some(size_key) = analysis.payload() {
                pending.min_width =
                    resolve_size_spacing_offset(config, diagnostics, size_key, &analysis.parsed.raw);
            }
        }
        UtilityKind::MaxWidth => {
            if let Some(size_key) = analysis.payload() {
                pending.max_width =
                    resolve_size_spacing_offset(config, diagnostics, size_key, &analysis.parsed.raw);
            }
        }
        UtilityKind::MinHeight => {
            if let Some(size_key) = analysis.payload() {
                pending.min_height =
                    resolve_size_spacing_offset(config, diagnostics, size_key, &analysis.parsed.raw);
            }
        }
        UtilityKind::MaxHeight => {
            if let Some(size_key) = analysis.payload() {
                pending.max_height =
                    resolve_size_spacing_offset(config, diagnostics, size_key, &analysis.parsed.raw);
            }
        }
        UtilityKind::ShadowSize => match analysis.payload() {
            Some("none") => {
                style.set_helper_prop("uishadow", "Enabled", "false".to_owned());
            }
            Some("inner") => {
                diagnostics.push(unsupported_shadow_inset_diagnostic(&analysis.parsed.raw));
            }
            key => {
                if let Some(preset) = resolve_shadow_preset(key) {
                    apply_shadow_preset(style, &preset);
                }
            }
        },
        UtilityKind::ShadowColor => {
            if let Some(color_key) = analysis.payload() {
                apply_shadow_color(style, config, diagnostics, color_key, &analysis.parsed.raw);
            }
        }
        UtilityKind::GradientDirection => {
            if let Some(direction) = analysis.payload() {
                if let Some(rotation) = resolve_gradient_rotation(direction) {
                    pending.gradient_rotation = Some(rotation);
                } else {
                    diagnostics.push(unsupported_gradient_direction_diagnostic(
                        direction,
                        &analysis.parsed.raw,
                    ));
                }
            }
        }
        UtilityKind::GradientFrom => {
            if let Some(color_key) = analysis.payload() {
                pending.gradient_from =
                    resolve_gradient_stop(config, diagnostics, color_key, &analysis.parsed.raw);
            }
        }
        UtilityKind::GradientVia => {
            if let Some(color_key) = analysis.payload() {
                pending.gradient_via =
                    resolve_gradient_stop(config, diagnostics, color_key, &analysis.parsed.raw);
            }
        }
        UtilityKind::GradientTo => {
            if let Some(color_key) = analysis.payload() {
                pending.gradient_to =
                    resolve_gradient_stop(config, diagnostics, color_key, &analysis.parsed.raw);
            }
        }
        UtilityKind::Unknown => {
            diagnostics.push(unsupported_utility_family_diagnostic(&analysis.parsed.raw));
        }
    }
}

fn apply_color_utility(
    style: &mut StyleIr,
    config: &TailwindConfig,
    diagnostics: &mut Vec<Diagnostic>,
    spec: crate::semantic::utility::ColorFamilySpec,
    color_key: &str,
    token: &str,
) {
    let Some(resolution) = resolve_color_value(config, diagnostics, spec, color_key, token) else {
        return;
    };

    match resolution {
        ColorResolution::Expression(value) => {
            if let Some(transparency_prop) = spec.transparency_prop {
                style.remove_prop(transparency_prop);
            }

            style.set_prop(spec.color_prop, value);
        }
        ColorResolution::Transparent => {
            if let Some(transparency_prop) = spec.transparency_prop {
                style.remove_prop(spec.color_prop);
                style.set_prop(transparency_prop, "1".to_owned());
                return;
            }

            diagnostics.push(unsupported_color_keyword_diagnostic(
                spec.theme_family,
                color_key,
                token,
            ));
        }
    }
}

fn apply_border_utility(
    style: &mut StyleIr,
    config: &TailwindConfig,
    diagnostics: &mut Vec<Diagnostic>,
    border_key: &str,
    token: &str,
) {
    if let Some(thickness) = resolve_border_thickness_value(Some(border_key)) {
        style.set_helper_prop("uistroke", "Thickness", thickness.to_owned());
        return;
    }

    if border_key == "transparent" {
        style.set_helper_prop("uistroke", "Transparency", "1".to_owned());
        return;
    }

    if is_known_unsupported_border_payload(border_key) {
        diagnostics.push(unsupported_border_value_diagnostic(border_key, token));
        return;
    }

    let Some(resolution) =
        resolve_color_value(config, diagnostics, BORDER_COLOR_FAMILY, border_key, token)
    else {
        return;
    };

    match resolution {
        ColorResolution::Expression(value) => {
            style.set_helper_prop("uistroke", "Color", value);
            style.set_helper_prop("uistroke", "Transparency", "0".to_owned());
        }
        ColorResolution::Transparent => {
            style.set_helper_prop("uistroke", "Transparency", "1".to_owned());
        }
    }
}

fn apply_spacing_utility(
    style: &mut StyleIr,
    config: &TailwindConfig,
    diagnostics: &mut Vec<Diagnostic>,
    spacing_key: &str,
    token: &str,
    axis: &PaddingKind,
) {
    if let Some(value) = resolve_spacing_value(config, spacing_key) {
        match axis {
            PaddingKind::All => {
                style.set_helper_prop("uipadding", "PaddingTop", value.clone());
                style.set_helper_prop("uipadding", "PaddingRight", value.clone());
                style.set_helper_prop("uipadding", "PaddingBottom", value.clone());
                style.set_helper_prop("uipadding", "PaddingLeft", value);
            }
            PaddingKind::X => {
                style.set_helper_prop("uipadding", "PaddingLeft", value.clone());
                style.set_helper_prop("uipadding", "PaddingRight", value);
            }
            PaddingKind::Y => {
                style.set_helper_prop("uipadding", "PaddingTop", value.clone());
                style.set_helper_prop("uipadding", "PaddingBottom", value);
            }
            PaddingKind::Top => {
                style.set_helper_prop("uipadding", "PaddingTop", value);
            }
            PaddingKind::Right => {
                style.set_helper_prop("uipadding", "PaddingRight", value);
            }
            PaddingKind::Bottom => {
                style.set_helper_prop("uipadding", "PaddingBottom", value);
            }
            PaddingKind::Left => {
                style.set_helper_prop("uipadding", "PaddingLeft", value);
            }
        }
        return;
    }

    diagnostics.push(unknown_theme_key_diagnostic("spacing", spacing_key, token));
}

fn resolve_gradient_stop(
    style_config: &TailwindConfig,
    diagnostics: &mut Vec<Diagnostic>,
    color_key: &str,
    token: &str,
) -> Option<String> {
    match resolve_color_value(style_config, diagnostics, GRADIENT_COLOR_FAMILY, color_key, token)? {
        ColorResolution::Expression(value) => Some(value),
        ColorResolution::Transparent => None,
    }
}

fn apply_shadow_color(
    style: &mut StyleIr,
    config: &TailwindConfig,
    diagnostics: &mut Vec<Diagnostic>,
    color_key: &str,
    token: &str,
) {
    let Some(resolution) =
        resolve_color_value(config, diagnostics, SHADOW_COLOR_FAMILY, color_key, token)
    else {
        return;
    };

    match resolution {
        ColorResolution::Expression(value) => {
            style.set_helper_prop("uishadow", "Color", value);
        }
        ColorResolution::Transparent => {
            style.set_helper_prop("uishadow", "Transparency", "1".to_owned());
        }
    }
}

fn apply_shadow_preset(style: &mut StyleIr, preset: &ShadowPreset) {
    style.set_helper_prop("uishadow", "BlurRadius", format!("new UDim(0, {})", preset.blur));
    style.set_helper_prop(
        "uishadow",
        "Offset",
        format!("UDim2.fromOffset(0, {})", preset.offset_y),
    );
    if preset.spread != 0 {
        style.set_helper_prop(
            "uishadow",
            "Spread",
            format!("UDim2.fromOffset({}, {})", preset.spread, preset.spread),
        );
    }
    style.set_helper_prop("uishadow", "Transparency", preset.transparency.to_owned());
}

fn apply_gap_utility(
    style: &mut StyleIr,
    config: &TailwindConfig,
    diagnostics: &mut Vec<Diagnostic>,
    spacing_key: &str,
    token: &str,
) {
    if let Some(value) = resolve_spacing_value(config, spacing_key) {
        style.set_helper_prop("uilistlayout", "Padding", value);
        return;
    }

    diagnostics.push(unknown_theme_key_diagnostic("spacing", spacing_key, token));
}

fn format_udim2_prop(width: Option<SizeAxisValue>, height: Option<SizeAxisValue>) -> String {
    let width = width.unwrap_or_else(SizeAxisValue::zero);
    let height = height.unwrap_or_else(SizeAxisValue::zero);

    if width.scale == "0" && height.scale == "0" {
        return format!("UDim2.fromOffset({}, {})", width.offset, height.offset);
    }

    if width.offset == "0" && height.offset == "0" {
        return format!("UDim2.fromScale({}, {})", width.scale, height.scale);
    }

    format!(
        "UDim2.new({}, {}, {}, {})",
        width.scale, width.offset, height.scale, height.offset
    )
}
