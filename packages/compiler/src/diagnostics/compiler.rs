use crate::api::Diagnostic;

pub(crate) fn unsupported_utility_family_diagnostic(token: &str) -> Diagnostic {
    let family = token
        .split_once('-')
        .map(|(family, _)| family)
        .unwrap_or(token);

    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-utility-family".to_owned(),
        message: format!("Unsupported utility family \"{family}\" in className literal."),
        token: Some(token.to_owned()),
    }
}

pub(crate) fn unsupported_z_index_auto_diagnostic(token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-z-index-auto".to_owned(),
        message: "Roblox `ZIndex` does not support Tailwind `auto`.".to_owned(),
        token: Some(token.to_owned()),
    }
}

pub(crate) fn negative_z_index_diagnostic(token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-negative-z-index".to_owned(),
        message: "Negative z-index is not supported on Roblox `ZIndex`.".to_owned(),
        token: Some(token.to_owned()),
    }
}

pub(crate) fn unsupported_arbitrary_z_index_diagnostic(token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-arbitrary-z-index".to_owned(),
        message: "Arbitrary z-index values are not supported yet on Roblox `ZIndex`.".to_owned(),
        token: Some(token.to_owned()),
    }
}

pub(crate) fn unsupported_z_index_value_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-z-index-value".to_owned(),
        message: format!(
            "Tailwind `z-{value}` is not supported yet; supported values are z-0, z-10, z-20, z-30, z-40, and z-50."
        ),
        token: Some(token.to_owned()),
    }
}

pub(crate) fn unsupported_rotation_value_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-rotation-value".to_owned(),
        message: format!(
            "Tailwind `rotate-{value}` is not supported yet; supported values are rotate-0, rotate-1, rotate-2, rotate-3, rotate-6, rotate-12, rotate-45, rotate-90, and rotate-180."
        ),
        token: Some(token.to_owned()),
    }
}

pub(crate) fn unsupported_opacity_value_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-opacity-value".to_owned(),
        message: format!(
            "Tailwind `opacity-{value}` is not supported; opacity must be an integer between 0 and 100."
        ),
        token: Some(token.to_owned()),
    }
}

pub(crate) fn unsupported_aspect_value_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-aspect-value".to_owned(),
        message: format!(
            "Tailwind `aspect-{value}` is not supported; supported values are `aspect-square`, `aspect-video`, and arbitrary ratios such as `aspect-[4/3]`."
        ),
        token: Some(token.to_owned()),
    }
}

pub(crate) fn unsupported_flex_direction_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-flex-direction".to_owned(),
        message: format!(
            "Tailwind `flex-{value}` is not supported; supported values are `flex`, `flex-row`, and `flex-col`."
        ),
        token: Some(token.to_owned()),
    }
}

pub(crate) fn unsupported_alignment_value_diagnostic(
    family: &str,
    value: &str,
    token: &str,
) -> Diagnostic {
    let supported = if family == "justify" {
        "`justify-start`, `justify-center`, `justify-end`, `justify-between`, `justify-around`, and `justify-evenly`"
    } else {
        "`items-start`, `items-center`, `items-end`, and `items-stretch`"
    };

    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-alignment-value".to_owned(),
        message: format!("Tailwind `{family}-{value}` is not supported; supported values are {supported}."),
        token: Some(token.to_owned()),
    }
}

pub(crate) fn unsupported_text_size_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-text-size".to_owned(),
        message: format!(
            "Tailwind `text-{value}` is not a supported font size; supported values are `text-xs` through `text-9xl`."
        ),
        token: Some(token.to_owned()),
    }
}

pub(crate) fn unsupported_font_weight_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-font-weight".to_owned(),
        message: format!(
            "Tailwind `font-{value}` is not supported; supported values are `font-thin`, `font-extralight`, `font-light`, `font-normal`, `font-medium`, `font-semibold`, `font-bold`, `font-extrabold`, and `font-black`."
        ),
        token: Some(token.to_owned()),
    }
}

pub(crate) fn unsupported_text_alignment_diagnostic(
    family: &str,
    value: &str,
    token: &str,
) -> Diagnostic {
    let supported = if family == "align" {
        "`align-top`, `align-middle`, and `align-bottom`"
    } else {
        "`text-left`, `text-center`, and `text-right`"
    };

    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-text-alignment".to_owned(),
        message: format!(
            "Tailwind `{family}-{value}` is not supported; supported values are {supported}."
        ),
        token: Some(token.to_owned()),
    }
}

pub(crate) fn unsupported_gradient_direction_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-gradient-direction".to_owned(),
        message: format!(
            "Tailwind `bg-gradient-to-{value}` is not supported; supported directions are `t`, `tr`, `r`, `br`, `b`, `bl`, `l`, and `tl`."
        ),
        token: Some(token.to_owned()),
    }
}

pub(crate) fn unsupported_shadow_inset_diagnostic(token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-shadow-inset".to_owned(),
        message: "Tailwind `shadow-inner` is not supported; Roblox `UIShadow` cannot render inset shadows.".to_owned(),
        token: Some(token.to_owned()),
    }
}

pub(crate) fn unsupported_overflow_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-overflow-value".to_owned(),
        message: format!(
            "Tailwind `overflow-{value}` is not supported; supported values are `overflow-hidden`, `overflow-clip`, and `overflow-visible`."
        ),
        token: Some(token.to_owned()),
    }
}

pub(crate) fn unsupported_anchor_value_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-anchor-value".to_owned(),
        message: format!(
            "`origin-{value}` is not supported; supported values are `origin-top-left`, `origin-top`, `origin-top-right`, `origin-left`, `origin-center`, `origin-right`, `origin-bottom-left`, `origin-bottom`, and `origin-bottom-right`."
        ),
        token: Some(token.to_owned()),
    }
}

pub(crate) fn unknown_theme_key_diagnostic(
    theme_family: &str,
    key: &str,
    token: &str,
) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unknown-theme-key".to_owned(),
        message: format!(
            "Unknown theme key \"{key}\" for {theme_family} utility in className literal."
        ),
        token: Some(token.to_owned()),
    }
}

pub(crate) fn unsupported_size_spacing_value_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-size-spacing-value".to_owned(),
        message: format!(
            "Spacing value \"{value}\" for size utility must be an offset-only UDim expression."
        ),
        token: Some(token.to_owned()),
    }
}

pub(crate) fn unsupported_border_value_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-border-value".to_owned(),
        message: format!(
            "Tailwind `border-{value}` is not supported yet; supported border utilities are `border`, `border-0`, `border-1`, `border-2`, `border-4`, `border-transparent`, and `border-{{color}}`."
        ),
        token: Some(token.to_owned()),
    }
}

pub(crate) fn unsupported_color_keyword_diagnostic(
    theme_family: &str,
    key: &str,
    token: &str,
) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-color-key".to_owned(),
        message: format!(
            "Unsupported color keyword \"{key}\" for {theme_family} utility in className literal."
        ),
        token: Some(token.to_owned()),
    }
}

pub(crate) fn color_requires_shade_diagnostic(
    theme_family: &str,
    key: &str,
    token: &str,
) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "color-missing-shade".to_owned(),
        message: format!(
            "Color palette \"{key}\" for {theme_family} utility requires an explicit shade such as \"{key}-500\" in className literal."
        ),
        token: Some(token.to_owned()),
    }
}

pub(crate) fn color_does_not_accept_shade_diagnostic(
    theme_family: &str,
    key: &str,
    shade: &str,
    token: &str,
) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "color-invalid-shade".to_owned(),
        message: format!(
            "Color \"{key}\" for {theme_family} utility is a singleton semantic color and does not accept shade \"{shade}\" in className literal."
        ),
        token: Some(token.to_owned()),
    }
}

pub(crate) fn color_missing_shade_diagnostic(
    theme_family: &str,
    key: &str,
    shade: &str,
    token: &str,
) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "color-invalid-shade".to_owned(),
        message: format!(
            "Color palette \"{key}\" for {theme_family} utility does not define shade \"{shade}\" in className literal."
        ),
        token: Some(token.to_owned()),
    }
}
