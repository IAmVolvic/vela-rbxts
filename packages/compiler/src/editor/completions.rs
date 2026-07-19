use crate::api::{CompletionItem, CompletionRequest, CompletionResponse};
use crate::config::model::TailwindConfig;
use crate::editor::{
    class_name_context_at_position, current_prefix, current_token_replacement,
    tokenize_class_name_with_ranges,
};
use crate::semantic::{
    utility::{
        ALIGNMENT_VALUES, ANCHOR_ORIGIN_VALUES, ASPECT_RATIO_VALUES, BORDER_LINE_JOIN_VALUES,
        BORDER_THICKNESS_VALUES, FLEX_DIRECTION_VALUES, FLEX_ITEM_VALUES, FONT_WEIGHT_VALUES,
        GRADIENT_DIRECTION_VALUES, JUSTIFY_FLEX_VALUES, OPACITY_VALUES, PaddingKind,
        ROTATION_VALUES, SCALE_VALUES, SHADOW_SIZE_VALUES, TEXT_SIZE_VALUES, TEXT_WRAP_VALUES,
        TEXT_X_ALIGN_VALUES, TEXT_Y_ALIGN_VALUES, UtilityKind, Z_INDEX_VALUES,
        color_completion_keys, is_utility_allowed_on_host, position_completion_keys,
        radius_completion_keys, size_completion_keys, spacing_completion_keys,
    },
    variant::RUNTIME_VARIANTS,
};

struct CompletionSpec {
    item: CompletionItem,
    utility_kind: UtilityKind,
}

pub(crate) fn get_completions_impl(request: CompletionRequest) -> CompletionResponse {
    let config = crate::editor::parse_editor_config(request.options.as_ref());
    let Some(context) = class_name_context_at_position(&request.source, request.position) else {
        return CompletionResponse {
            is_in_class_name_context: false,
            items: Vec::new(),
        };
    };

    let tokens = tokenize_class_name_with_ranges(&context.value, context.value_range.start);
    let replacement = current_token_replacement(&tokens, request.position);
    let prefix = current_prefix(&tokens, &replacement, request.position);
    let items = completion_candidates(&config, context.element_tag.as_deref())
        .into_iter()
        .filter(|item| item.label.starts_with(&prefix))
        .map(|mut item| {
            item.replacement = Some(replacement.clone());
            item
        })
        .collect();

    CompletionResponse {
        is_in_class_name_context: true,
        items,
    }
}

fn completion_candidates(
    config: &TailwindConfig,
    element_tag: Option<&str>,
) -> Vec<CompletionItem> {
    let mut items = Vec::new();

    for variant in RUNTIME_VARIANTS {
        push_completion(
            &mut items,
            &format!("{variant}:"),
            "variant",
            "runtime variant",
            &format!(
                "Apply the following vela-rbxts utility when the {variant} condition matches."
            ),
        );
    }

    for base in base_utility_candidates(config) {
        if !is_utility_allowed_on_host(element_tag, &base.utility_kind) {
            continue;
        }

        items.push(base.item.clone());

        for variant in RUNTIME_VARIANTS {
            push_completion(
                &mut items,
                &format!("{variant}:{}", base.item.label),
                &base.item.category,
                &base.item.kind,
                &format!(
                    "Runtime variant of {}. {}",
                    base.item.label, base.item.documentation
                ),
            );
        }
    }

    let mut seen = std::collections::HashSet::new();
    items.retain(|item| seen.insert(item.label.clone()));
    items
}

fn base_utility_candidates(config: &TailwindConfig) -> Vec<CompletionSpec> {
    let mut items = Vec::new();

    for (prefix, prop, category, utility_kind) in [
        (
            "bg",
            "BackgroundColor3",
            "color",
            UtilityKind::BackgroundColor,
        ),
        ("text", "TextColor3", "color", UtilityKind::TextColor),
        ("image", "ImageColor3", "color", UtilityKind::ImageColor),
        (
            "placeholder",
            "PlaceholderColor3",
            "color",
            UtilityKind::PlaceholderColor,
        ),
    ] {
        for color_key in color_completion_keys(config) {
            items.push(CompletionSpec {
                item: CompletionItem {
                    label: format!("{prefix}-{color_key}"),
                    insert_text: format!("{prefix}-{color_key}"),
                    kind: "utility".to_owned(),
                    category: category.to_owned(),
                    documentation: format!("Set Roblox {prop} from theme color `{color_key}`."),
                    replacement: None,
                },
                utility_kind: utility_kind.clone(),
            });
        }
        items.push(CompletionSpec {
            item: CompletionItem {
                label: format!("{prefix}-transparent"),
                insert_text: format!("{prefix}-transparent"),
                kind: "utility".to_owned(),
                category: category.to_owned(),
                documentation: format!("Use the transparent keyword for Roblox {prop}."),
                replacement: None,
            },
            utility_kind,
        });
    }

    items.push(CompletionSpec {
        item: CompletionItem {
            label: "border".to_owned(),
            insert_text: "border".to_owned(),
            kind: "utility".to_owned(),
            category: "border".to_owned(),
            documentation: "Create a Roblox UIStroke with `Thickness = 1`.".to_owned(),
            replacement: None,
        },
        utility_kind: UtilityKind::Border,
    });

    for thickness in BORDER_THICKNESS_VALUES {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: format!("border-{thickness}"),
                insert_text: format!("border-{thickness}"),
                kind: "utility".to_owned(),
                category: "border".to_owned(),
                documentation: format!("Set Roblox UIStroke.Thickness to `{thickness}`."),
                replacement: None,
            },
            utility_kind: UtilityKind::Border,
        });
    }

    items.push(CompletionSpec {
        item: CompletionItem {
            label: "border-transparent".to_owned(),
            insert_text: "border-transparent".to_owned(),
            kind: "utility".to_owned(),
            category: "border".to_owned(),
            documentation: "Set Roblox UIStroke.Transparency to `1`.".to_owned(),
            replacement: None,
        },
        utility_kind: UtilityKind::Border,
    });

    for line_join in BORDER_LINE_JOIN_VALUES {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: format!("border-{line_join}"),
                insert_text: format!("border-{line_join}"),
                kind: "utility".to_owned(),
                category: "border".to_owned(),
                documentation: format!(
                    "Set Roblox UIStroke.LineJoinMode from `border-{line_join}`."
                ),
                replacement: None,
            },
            utility_kind: UtilityKind::Border,
        });
    }

    for color_key in color_completion_keys(config) {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: format!("border-{color_key}"),
                insert_text: format!("border-{color_key}"),
                kind: "utility".to_owned(),
                category: "color".to_owned(),
                documentation: format!("Set Roblox UIStroke.Color from theme color `{color_key}`."),
                replacement: None,
            },
            utility_kind: UtilityKind::Border,
        });
    }

    for key in radius_completion_keys(config) {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: format!("rounded-{key}"),
                insert_text: format!("rounded-{key}"),
                kind: "utility".to_owned(),
                category: "radius".to_owned(),
                documentation: format!("Set UICorner.CornerRadius from theme radius `{key}`."),
                replacement: None,
            },
            utility_kind: UtilityKind::Radius,
        });
    }

    for key in Z_INDEX_VALUES {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: format!("z-{key}"),
                insert_text: format!("z-{key}"),
                kind: "utility".to_owned(),
                category: "stacking".to_owned(),
                documentation: format!("Set Roblox ZIndex to `{key}`."),
                replacement: None,
            },
            utility_kind: UtilityKind::ZIndex,
        });
    }

    let spacing_keys = spacing_completion_keys(config);
    for (prefix, utility_kind) in [
        ("p", UtilityKind::Padding(PaddingKind::All)),
        ("px", UtilityKind::Padding(PaddingKind::X)),
        ("py", UtilityKind::Padding(PaddingKind::Y)),
        ("pt", UtilityKind::Padding(PaddingKind::Top)),
        ("pr", UtilityKind::Padding(PaddingKind::Right)),
        ("pb", UtilityKind::Padding(PaddingKind::Bottom)),
        ("pl", UtilityKind::Padding(PaddingKind::Left)),
        ("gap", UtilityKind::Gap),
    ] {
        for key in &spacing_keys {
            let target = if prefix == "gap" {
                "UIListLayout.Padding"
            } else {
                "UIPadding"
            };
            items.push(CompletionSpec {
                item: CompletionItem {
                    label: format!("{prefix}-{key}"),
                    insert_text: format!("{prefix}-{key}"),
                    kind: "utility".to_owned(),
                    category: "spacing".to_owned(),
                    documentation: format!("Set Roblox {target} from spacing `{key}`."),
                    replacement: None,
                },
                utility_kind: utility_kind.clone(),
            });
        }
    }

    for (prefix, utility_kind) in [
        ("w", UtilityKind::Width),
        ("h", UtilityKind::Height),
        ("size", UtilityKind::Size),
    ] {
        for key in size_completion_keys(config) {
            items.push(CompletionSpec {
                item: CompletionItem {
                    label: format!("{prefix}-{key}"),
                    insert_text: format!("{prefix}-{key}"),
                    kind: "utility".to_owned(),
                    category: "size".to_owned(),
                    documentation: format!("Set Roblox Size using `{prefix}-{key}`."),
                    replacement: None,
                },
                utility_kind: utility_kind.clone(),
            });
        }
    }

    for degrees in ROTATION_VALUES {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: format!("rotate-{degrees}"),
                insert_text: format!("rotate-{degrees}"),
                kind: "utility".to_owned(),
                category: "transform".to_owned(),
                documentation: format!("Set Roblox Rotation to `{degrees}`."),
                replacement: None,
            },
            utility_kind: UtilityKind::Rotation,
        });

        if degrees != "0" {
            items.push(CompletionSpec {
                item: CompletionItem {
                    label: format!("-rotate-{degrees}"),
                    insert_text: format!("-rotate-{degrees}"),
                    kind: "utility".to_owned(),
                    category: "transform".to_owned(),
                    documentation: format!("Set Roblox Rotation to `-{degrees}`."),
                    replacement: None,
                },
                utility_kind: UtilityKind::Rotation,
            });
        }
    }

    for scale in SCALE_VALUES {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: format!("scale-{scale}"),
                insert_text: format!("scale-{scale}"),
                kind: "utility".to_owned(),
                category: "transform".to_owned(),
                documentation: format!("Set Roblox UIScale.Scale from `scale-{scale}`."),
                replacement: None,
            },
            utility_kind: UtilityKind::Scale,
        });
    }

    for percent in OPACITY_VALUES {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: format!("opacity-{percent}"),
                insert_text: format!("opacity-{percent}"),
                kind: "utility".to_owned(),
                category: "effects".to_owned(),
                documentation: format!(
                    "Set Roblox BackgroundTransparency from opacity `{percent}`."
                ),
                replacement: None,
            },
            utility_kind: UtilityKind::Opacity,
        });
    }

    for key in ASPECT_RATIO_VALUES {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: format!("aspect-{key}"),
                insert_text: format!("aspect-{key}"),
                kind: "utility".to_owned(),
                category: "layout".to_owned(),
                documentation: format!(
                    "Set Roblox UIAspectRatioConstraint.AspectRatio from `aspect-{key}`."
                ),
                replacement: None,
            },
            utility_kind: UtilityKind::AspectRatio,
        });
    }

    items.push(CompletionSpec {
        item: CompletionItem {
            label: "flex".to_owned(),
            insert_text: "flex".to_owned(),
            kind: "utility".to_owned(),
            category: "layout".to_owned(),
            documentation: "Create a Roblox UIListLayout with a horizontal fill direction."
                .to_owned(),
            replacement: None,
        },
        utility_kind: UtilityKind::FlexDirection,
    });

    for direction in FLEX_DIRECTION_VALUES {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: format!("flex-{direction}"),
                insert_text: format!("flex-{direction}"),
                kind: "utility".to_owned(),
                category: "layout".to_owned(),
                documentation: format!(
                    "Set Roblox UIListLayout.FillDirection from `flex-{direction}`."
                ),
                replacement: None,
            },
            utility_kind: UtilityKind::FlexDirection,
        });
    }

    for (prefix, utility_kind, axis) in [
        ("left", UtilityKind::PositionX, "Position.X"),
        ("top", UtilityKind::PositionY, "Position.Y"),
        ("inset", UtilityKind::Inset, "Position"),
    ] {
        for key in position_completion_keys(config) {
            for label in [format!("{prefix}-{key}"), format!("-{prefix}-{key}")] {
                items.push(CompletionSpec {
                    item: CompletionItem {
                        label: label.clone(),
                        insert_text: label,
                        kind: "utility".to_owned(),
                        category: "layout".to_owned(),
                        documentation: format!("Set Roblox {axis} using `{prefix}-{key}`."),
                        replacement: None,
                    },
                    utility_kind: utility_kind.clone(),
                });
            }
        }
    }

    for origin in ANCHOR_ORIGIN_VALUES {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: format!("origin-{origin}"),
                insert_text: format!("origin-{origin}"),
                kind: "utility".to_owned(),
                category: "layout".to_owned(),
                documentation: format!("Set Roblox AnchorPoint from `origin-{origin}`."),
                replacement: None,
            },
            utility_kind: UtilityKind::AnchorPoint,
        });
    }

    for (key, value) in TEXT_SIZE_VALUES {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: format!("text-{key}"),
                insert_text: format!("text-{key}"),
                kind: "utility".to_owned(),
                category: "typography".to_owned(),
                documentation: format!("Set Roblox TextSize to `{value}`."),
                replacement: None,
            },
            utility_kind: UtilityKind::TextSize,
        });
    }

    for (key, weight) in FONT_WEIGHT_VALUES {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: format!("font-{key}"),
                insert_text: format!("font-{key}"),
                kind: "utility".to_owned(),
                category: "typography".to_owned(),
                documentation: format!("Set Roblox FontFace weight to `{weight}`."),
                replacement: None,
            },
            utility_kind: UtilityKind::FontWeight,
        });
    }

    for alignment in TEXT_X_ALIGN_VALUES {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: format!("text-{alignment}"),
                insert_text: format!("text-{alignment}"),
                kind: "utility".to_owned(),
                category: "typography".to_owned(),
                documentation: format!("Set Roblox TextXAlignment from `text-{alignment}`."),
                replacement: None,
            },
            utility_kind: UtilityKind::TextXAlignment,
        });
    }

    for alignment in TEXT_Y_ALIGN_VALUES {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: format!("align-{alignment}"),
                insert_text: format!("align-{alignment}"),
                kind: "utility".to_owned(),
                category: "typography".to_owned(),
                documentation: format!("Set Roblox TextYAlignment from `align-{alignment}`."),
                replacement: None,
            },
            utility_kind: UtilityKind::TextYAlignment,
        });
    }

    for wrap in TEXT_WRAP_VALUES {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: format!("text-{wrap}"),
                insert_text: format!("text-{wrap}"),
                kind: "utility".to_owned(),
                category: "typography".to_owned(),
                documentation: format!("Set Roblox TextWrapped from `text-{wrap}`."),
                replacement: None,
            },
            utility_kind: UtilityKind::TextWrap,
        });
    }

    items.push(CompletionSpec {
        item: CompletionItem {
            label: "truncate".to_owned(),
            insert_text: "truncate".to_owned(),
            kind: "utility".to_owned(),
            category: "typography".to_owned(),
            documentation: "Set Roblox TextTruncate to `Enum.TextTruncate.AtEnd`.".to_owned(),
            replacement: None,
        },
        utility_kind: UtilityKind::TextTruncate,
    });

    for (label, prop, value, utility_kind) in [
        ("hidden", "Visible", "false", UtilityKind::Visibility),
        ("visible", "Visible", "true", UtilityKind::Visibility),
        (
            "overflow-hidden",
            "ClipsDescendants",
            "true",
            UtilityKind::Overflow,
        ),
        (
            "overflow-clip",
            "ClipsDescendants",
            "true",
            UtilityKind::Overflow,
        ),
        (
            "overflow-visible",
            "ClipsDescendants",
            "false",
            UtilityKind::Overflow,
        ),
        (
            "flex-wrap",
            "UIListLayout.Wraps",
            "true",
            UtilityKind::FlexWrap,
        ),
        (
            "flex-nowrap",
            "UIListLayout.Wraps",
            "false",
            UtilityKind::FlexWrap,
        ),
    ] {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: label.to_owned(),
                insert_text: label.to_owned(),
                kind: "utility".to_owned(),
                category: "layout".to_owned(),
                documentation: format!("Set Roblox {prop} to `{value}`."),
                replacement: None,
            },
            utility_kind,
        });
    }

    items.push(CompletionSpec {
        item: CompletionItem {
            label: "shadow".to_owned(),
            insert_text: "shadow".to_owned(),
            kind: "utility".to_owned(),
            category: "effects".to_owned(),
            documentation: "Create a Roblox UIShadow with the default drop shadow.".to_owned(),
            replacement: None,
        },
        utility_kind: UtilityKind::ShadowSize,
    });

    for size in SHADOW_SIZE_VALUES {
        let documentation = if size == "none" {
            "Disable the UIShadow via `UIShadow.Enabled = false`.".to_owned()
        } else {
            format!("Create a Roblox UIShadow sized like Tailwind `shadow-{size}`.")
        };
        items.push(CompletionSpec {
            item: CompletionItem {
                label: format!("shadow-{size}"),
                insert_text: format!("shadow-{size}"),
                kind: "utility".to_owned(),
                category: "effects".to_owned(),
                documentation,
                replacement: None,
            },
            utility_kind: UtilityKind::ShadowSize,
        });
    }

    for color_key in color_completion_keys(config) {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: format!("shadow-{color_key}"),
                insert_text: format!("shadow-{color_key}"),
                kind: "utility".to_owned(),
                category: "color".to_owned(),
                documentation: format!("Set Roblox UIShadow.Color from theme color `{color_key}`."),
                replacement: None,
            },
            utility_kind: UtilityKind::ShadowColor,
        });
    }

    for direction in GRADIENT_DIRECTION_VALUES {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: format!("bg-gradient-to-{direction}"),
                insert_text: format!("bg-gradient-to-{direction}"),
                kind: "utility".to_owned(),
                category: "effects".to_owned(),
                documentation: format!(
                    "Create a Roblox UIGradient pointing `{direction}`. Combine with `from-*`/`via-*`/`to-*`."
                ),
                replacement: None,
            },
            utility_kind: UtilityKind::GradientDirection,
        });
    }

    for (prefix, utility_kind) in [
        ("from", UtilityKind::GradientFrom),
        ("via", UtilityKind::GradientVia),
        ("to", UtilityKind::GradientTo),
    ] {
        for color_key in color_completion_keys(config) {
            items.push(CompletionSpec {
                item: CompletionItem {
                    label: format!("{prefix}-{color_key}"),
                    insert_text: format!("{prefix}-{color_key}"),
                    kind: "utility".to_owned(),
                    category: "color".to_owned(),
                    documentation: format!(
                        "Add a `{prefix}` UIGradient color stop from theme color `{color_key}`."
                    ),
                    replacement: None,
                },
                utility_kind: utility_kind.clone(),
            });
        }
    }

    for (prefix, target, utility_kind) in [
        ("min-w", "UISizeConstraint.MinSize.X", UtilityKind::MinWidth),
        ("max-w", "UISizeConstraint.MaxSize.X", UtilityKind::MaxWidth),
        (
            "min-h",
            "UISizeConstraint.MinSize.Y",
            UtilityKind::MinHeight,
        ),
        (
            "max-h",
            "UISizeConstraint.MaxSize.Y",
            UtilityKind::MaxHeight,
        ),
    ] {
        for key in spacing_completion_keys(config) {
            items.push(CompletionSpec {
                item: CompletionItem {
                    label: format!("{prefix}-{key}"),
                    insert_text: format!("{prefix}-{key}"),
                    kind: "utility".to_owned(),
                    category: "size".to_owned(),
                    documentation: format!("Set Roblox {target} from spacing `{key}`."),
                    replacement: None,
                },
                utility_kind: utility_kind.clone(),
            });
        }
    }

    for (prefix, utility_kind) in [
        ("justify", UtilityKind::JustifyContent),
        ("items", UtilityKind::AlignItems),
    ] {
        for alignment in ALIGNMENT_VALUES {
            let target = if prefix == "justify" {
                "UIListLayout.HorizontalAlignment"
            } else {
                "UIListLayout.VerticalAlignment"
            };
            items.push(CompletionSpec {
                item: CompletionItem {
                    label: format!("{prefix}-{alignment}"),
                    insert_text: format!("{prefix}-{alignment}"),
                    kind: "utility".to_owned(),
                    category: "layout".to_owned(),
                    documentation: format!("Set Roblox {target} from `{prefix}-{alignment}`."),
                    replacement: None,
                },
                utility_kind: utility_kind.clone(),
            });
        }
    }

    for alignment in JUSTIFY_FLEX_VALUES {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: format!("justify-{alignment}"),
                insert_text: format!("justify-{alignment}"),
                kind: "utility".to_owned(),
                category: "layout".to_owned(),
                documentation: format!(
                    "Set Roblox UIListLayout.HorizontalFlex from `justify-{alignment}`."
                ),
                replacement: None,
            },
            utility_kind: UtilityKind::JustifyContent,
        });
    }

    items.push(CompletionSpec {
        item: CompletionItem {
            label: "items-stretch".to_owned(),
            insert_text: "items-stretch".to_owned(),
            kind: "utility".to_owned(),
            category: "layout".to_owned(),
            documentation: "Set Roblox UIListLayout.VerticalFlex to `Enum.UIFlexAlignment.Fill`."
                .to_owned(),
            replacement: None,
        },
        utility_kind: UtilityKind::AlignItems,
    });

    for label in FLEX_ITEM_VALUES {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: label.to_owned(),
                insert_text: label.to_owned(),
                kind: "utility".to_owned(),
                category: "layout".to_owned(),
                documentation: format!("Add a Roblox UIFlexItem from `{label}`."),
                replacement: None,
            },
            utility_kind: UtilityKind::FlexItem,
        });
    }

    items
}

fn push_completion(
    items: &mut Vec<CompletionItem>,
    label: &str,
    category: &str,
    kind: &str,
    documentation: &str,
) {
    items.push(CompletionItem {
        label: label.to_owned(),
        insert_text: label.to_owned(),
        kind: kind.to_owned(),
        category: category.to_owned(),
        documentation: documentation.to_owned(),
        replacement: None,
    });
}
