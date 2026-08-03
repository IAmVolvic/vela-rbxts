use crate::api::{CompletionItem, CompletionRequest, CompletionResponse};
use crate::config::model::TailwindConfig;
use crate::editor::colors::parse_color3_from_rgb;
use crate::editor::{
    class_name_context_at_position, current_prefix, current_token_replacement,
    tokenize_class_name_with_ranges, utf16_len,
};
use crate::semantic::{
    utility::{
        ALIGN_CONTENT_VALUES, ALIGN_SELF_VALUES, ALIGNMENT_VALUES, ANCHOR_ORIGIN_VALUES,
        ANIMATION_VALUES, ASPECT_RATIO_VALUES, BACKGROUND_COLOR_FAMILY, BORDER_LINE_JOIN_VALUES,
        BORDER_THICKNESS_VALUES, CANVAS_SIZE_VALUES, ColorResolution, DURATION_PRESET_VALUES,
        EASE_VALUES, FLEX_DIRECTION_VALUES, FLEX_ITEM_VALUES, FONT_STYLE_VALUES,
        FONT_WEIGHT_VALUES, GRADIENT_DIRECTION_VALUES, GRID_CELL_COUNT_MAX, JUSTIFY_FLEX_VALUES,
        LAYOUT_ORDER_KEYWORDS, LINE_HEIGHT_VALUES, OBJECT_FIT_VALUES, OPACITY_VALUES,
        OVERSCROLL_VALUES, PALETTE_DEFAULT_KEY, POINTER_EVENTS_VALUES, PaddingKind,
        RING_THICKNESS_VALUES, ROTATION_VALUES, SCALE_VALUES, SCROLL_DIRECTION_VALUES,
        SHADOW_SIZE_VALUES, TEXT_SIZE_VALUES, TEXT_WRAP_VALUES, TEXT_X_ALIGN_VALUES,
        TEXT_Y_ALIGN_VALUES, UtilityKind, WHITESPACE_VALUES, Z_INDEX_VALUES, color_completion_keys,
        is_utility_allowed_on_host, position_completion_keys, radius_completion_keys,
        resolve_color_value, size_completion_keys, spacing_completion_keys,
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
    let mut replacement = current_token_replacement(&tokens, request.position);
    let typed = current_prefix(&tokens, &replacement, request.position);

    // Variants already typed stay put; only the utility after the last `:` is
    // completed, which keeps labels short and the list free of a variant
    // cross-product.
    let (variants, prefix) = split_typed_variants(&typed);
    replacement.start += utf16_len(variants);

    let items = completion_candidates(&config, context.element_tag.as_deref(), variants, prefix)
        .into_iter()
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

fn split_typed_variants(typed: &str) -> (&str, &str) {
    match typed.rfind(':') {
        Some(index) => typed.split_at(index + 1),
        None => ("", typed),
    }
}

fn completion_candidates(
    config: &TailwindConfig,
    element_tag: Option<&str>,
    typed_variants: &str,
    prefix: &str,
) -> Vec<CompletionItem> {
    let mut items = Vec::new();
    let used: Vec<&str> = typed_variants
        .split(':')
        .filter(|v| !v.is_empty())
        .collect();

    for (variant, condition) in RUNTIME_VARIANTS {
        if used.contains(&variant) {
            continue;
        }

        let label = format!("{variant}:");
        // Variants rank just behind utilities so a literal match still wins.
        let Some(score) = match_score(&label, prefix).map(|score| score + 1) else {
            continue;
        };

        items.push(CompletionItem {
            label: label.clone(),
            insert_text: label.clone(),
            kind: "runtime variant".to_owned(),
            category: "variant".to_owned(),
            documentation: format!("Apply the following vela-rbxts utility when {condition}."),
            replacement: None,
            color: None,
            sort_text: Some(sort_text(score, &label)),
        });
    }

    for base in base_utility_candidates(config) {
        if !is_utility_allowed_on_host(element_tag, &base.utility_kind) {
            continue;
        }

        let Some(score) = match_score(&base.item.label, prefix) else {
            continue;
        };

        let mut item = base.item;
        item.sort_text = Some(sort_text(score, &item.label));
        items.push(item);
    }

    let mut seen = std::collections::HashSet::new();
    items.retain(|item| seen.insert(item.label.clone()));
    items.sort_by(|left, right| left.sort_text.cmp(&right.sort_text));
    items
}

fn sort_text(score: u32, label: &str) -> String {
    format!("{score:03}-{label}")
}

/// Ranks a candidate against what the user typed, lower being better. `None`
/// means the candidate does not match at all. Beyond a literal prefix this
/// accepts word-boundary and subsequence hits, so `slate` reaches
/// `bg-slate-500` and `bgsl` reaches `bg-slate-*`.
fn match_score(label: &str, prefix: &str) -> Option<u32> {
    if prefix.is_empty() {
        return Some(50);
    }

    if label.starts_with(prefix) {
        return Some(0);
    }

    if let Some(index) = label.find(prefix) {
        let at_boundary = label[..index].ends_with('-');
        return Some(if at_boundary { 10 } else { 20 });
    }

    is_subsequence(label, prefix).then_some(30)
}

fn is_subsequence(label: &str, prefix: &str) -> bool {
    let mut candidate = label.chars();
    prefix
        .chars()
        .all(|wanted| candidate.any(|actual| actual == wanted))
}

/// `#rrggbb` for a theme color key, so the editor can draw a swatch next to the
/// completion instead of a generic icon.
fn color_swatch(config: &TailwindConfig, color_key: &str) -> Option<String> {
    let mut diagnostics = Vec::new();
    let resolution = resolve_color_value(
        config,
        &mut diagnostics,
        BACKGROUND_COLOR_FAMILY,
        color_key,
        color_key,
    )?;

    let ColorResolution::Expression(value) = resolution else {
        return None;
    };

    let (red, green, blue) = parse_color3_from_rgb(&value)?;
    Some(format!("#{red:02x}{green:02x}{blue:02x}"))
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
        (
            "scrollbar",
            "ScrollBarImageColor3",
            "color",
            UtilityKind::ScrollbarColor,
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
                    color: color_swatch(config, &color_key),
                    sort_text: None,
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
                color: None,
                sort_text: None,
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
            color: None,
            sort_text: None,
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
                color: None,
                sort_text: None,
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
            color: None,
            sort_text: None,
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
                color: None,
                sort_text: None,
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
                color: color_swatch(config, &color_key),
                sort_text: None,
            },
            utility_kind: UtilityKind::Border,
        });
    }

    for key in radius_completion_keys(config) {
        // `rounded-DEFAULT` is not a class; the DEFAULT radius is what a bare
        // `rounded` resolves to.
        let label = if key == PALETTE_DEFAULT_KEY {
            "rounded".to_owned()
        } else {
            format!("rounded-{key}")
        };
        items.push(CompletionSpec {
            item: CompletionItem {
                label: label.clone(),
                insert_text: label,
                kind: "utility".to_owned(),
                category: "radius".to_owned(),
                documentation: format!("Set UICorner.CornerRadius from theme radius `{key}`."),
                replacement: None,
                color: None,
                sort_text: None,
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
                color: None,
                sort_text: None,
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
                    color: None,
                    sort_text: None,
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
                    color: None,
                    sort_text: None,
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
                color: None,
                sort_text: None,
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
                    color: None,
                    sort_text: None,
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
                color: None,
                sort_text: None,
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
                color: None,
                sort_text: None,
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
                color: None,
                sort_text: None,
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
            color: None,
            sort_text: None,
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
                color: None,
                sort_text: None,
            },
            utility_kind: UtilityKind::FlexDirection,
        });
    }

    for (prefix, utility_kind, axis) in [
        ("left", UtilityKind::PositionX, "Position.X"),
        ("top", UtilityKind::PositionY, "Position.Y"),
        ("right", UtilityKind::PositionRight, "Position.X"),
        ("bottom", UtilityKind::PositionBottom, "Position.Y"),
        ("inset", UtilityKind::Inset, "Position"),
        ("translate-x", UtilityKind::TranslateX, "Position.X shift"),
        ("translate-y", UtilityKind::TranslateY, "Position.Y shift"),
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
                        color: None,
                        sort_text: None,
                    },
                    utility_kind: utility_kind.clone(),
                });
            }
        }
    }

    for alignment in ALIGN_CONTENT_VALUES {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: format!("content-{alignment}"),
                insert_text: format!("content-{alignment}"),
                kind: "utility".to_owned(),
                category: "layout".to_owned(),
                documentation: format!(
                    "Set Roblox UIListLayout cross-axis packing from `content-{alignment}`."
                ),
                replacement: None,
                color: None,
                sort_text: None,
            },
            utility_kind: UtilityKind::AlignContent,
        });
    }

    for (key, alignment) in ALIGN_SELF_VALUES {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: format!("self-{key}"),
                insert_text: format!("self-{key}"),
                kind: "utility".to_owned(),
                category: "layout".to_owned(),
                documentation: format!(
                    "Add a Roblox UIFlexItem with `ItemLineAlignment = Enum.ItemLineAlignment.{alignment}`."
                ),
                replacement: None,
                color: None,
                sort_text: None,
            },
            utility_kind: UtilityKind::AlignSelf,
        });
    }

    for key in LAYOUT_ORDER_KEYWORDS
        .iter()
        .map(|(name, _)| (*name).to_owned())
        .chain((1..=12).map(|order| order.to_string()))
    {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: format!("order-{key}"),
                insert_text: format!("order-{key}"),
                kind: "utility".to_owned(),
                category: "layout".to_owned(),
                documentation: format!("Set Roblox LayoutOrder from `order-{key}`."),
                replacement: None,
                color: None,
                sort_text: None,
            },
            utility_kind: UtilityKind::LayoutOrder,
        });
    }

    for (key, scale_type) in OBJECT_FIT_VALUES {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: format!("object-{key}"),
                insert_text: format!("object-{key}"),
                kind: "utility".to_owned(),
                category: "layout".to_owned(),
                documentation: format!("Set Roblox ScaleType to `Enum.ScaleType.{scale_type}`."),
                replacement: None,
                color: None,
                sort_text: None,
            },
            utility_kind: UtilityKind::ObjectFit,
        });
    }

    for (key, value) in POINTER_EVENTS_VALUES {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: format!("pointer-events-{key}"),
                insert_text: format!("pointer-events-{key}"),
                kind: "utility".to_owned(),
                category: "layout".to_owned(),
                documentation: format!("Set Roblox Interactable to `{value}`."),
                replacement: None,
                color: None,
                sort_text: None,
            },
            utility_kind: UtilityKind::PointerEvents,
        });
    }

    for (prefix, utility_kind, direction) in [
        ("space-x", UtilityKind::SpaceX, "Horizontal"),
        ("space-y", UtilityKind::SpaceY, "Vertical"),
    ] {
        for key in spacing_completion_keys(config) {
            items.push(CompletionSpec {
                item: CompletionItem {
                    label: format!("{prefix}-{key}"),
                    insert_text: format!("{prefix}-{key}"),
                    kind: "utility".to_owned(),
                    category: "layout".to_owned(),
                    documentation: format!(
                        "Set Roblox UIListLayout.Padding from spacing `{key}` with `FillDirection = Enum.FillDirection.{direction}`."
                    ),
                    replacement: None,
                    color: None,
                    sort_text: None,
                },
                utility_kind: utility_kind.clone(),
            });
        }
    }

    for (key, value) in WHITESPACE_VALUES {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: format!("whitespace-{key}"),
                insert_text: format!("whitespace-{key}"),
                kind: "utility".to_owned(),
                category: "typography".to_owned(),
                documentation: format!("Set Roblox TextWrapped to `{value}`."),
                replacement: None,
                color: None,
                sort_text: None,
            },
            utility_kind: UtilityKind::Whitespace,
        });
    }

    for (key, behavior) in OVERSCROLL_VALUES {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: format!("overscroll-{key}"),
                insert_text: format!("overscroll-{key}"),
                kind: "utility".to_owned(),
                category: "layout".to_owned(),
                documentation: format!(
                    "Set Roblox ElasticBehavior to `Enum.ElasticBehavior.{behavior}`."
                ),
                replacement: None,
                color: None,
                sort_text: None,
            },
            utility_kind: UtilityKind::Overscroll,
        });
    }

    for (key, direction) in SCROLL_DIRECTION_VALUES {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: format!("scroll-{key}"),
                insert_text: format!("scroll-{key}"),
                kind: "utility".to_owned(),
                category: "layout".to_owned(),
                documentation: format!(
                    "Set Roblox ScrollingDirection to `Enum.ScrollingDirection.{direction}`."
                ),
                replacement: None,
                color: None,
                sort_text: None,
            },
            utility_kind: UtilityKind::ScrollDirection,
        });
    }

    items.push(CompletionSpec {
        item: CompletionItem {
            label: "scroll-none".to_owned(),
            insert_text: "scroll-none".to_owned(),
            kind: "utility".to_owned(),
            category: "layout".to_owned(),
            documentation: "Set Roblox ScrollingEnabled to `false`.".to_owned(),
            replacement: None,
            color: None,
            sort_text: None,
        },
        utility_kind: UtilityKind::ScrollDirection,
    });

    for key in spacing_completion_keys(config) {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: format!("scrollbar-w-{key}"),
                insert_text: format!("scrollbar-w-{key}"),
                kind: "utility".to_owned(),
                category: "layout".to_owned(),
                documentation: format!("Set Roblox ScrollBarThickness from spacing `{key}`."),
                replacement: None,
                color: None,
                sort_text: None,
            },
            utility_kind: UtilityKind::ScrollbarThickness,
        });
    }

    items.push(CompletionSpec {
        item: CompletionItem {
            label: "scrollbar-none".to_owned(),
            insert_text: "scrollbar-none".to_owned(),
            kind: "utility".to_owned(),
            category: "layout".to_owned(),
            documentation: "Hide the scrollbar by setting `ScrollBarThickness = 0`.".to_owned(),
            replacement: None,
            color: None,
            sort_text: None,
        },
        utility_kind: UtilityKind::ScrollbarThickness,
    });

    for (key, axis) in CANVAS_SIZE_VALUES {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: format!("canvas-{key}"),
                insert_text: format!("canvas-{key}"),
                kind: "utility".to_owned(),
                category: "layout".to_owned(),
                documentation: format!(
                    "Set Roblox AutomaticCanvasSize to `Enum.AutomaticSize.{axis}`."
                ),
                replacement: None,
                color: None,
                sort_text: None,
            },
            utility_kind: UtilityKind::CanvasSize,
        });
    }

    for (family, utility_kind) in [
        ("ring", UtilityKind::Ring),
        ("outline", UtilityKind::Outline),
    ] {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: family.to_owned(),
                insert_text: family.to_owned(),
                kind: "utility".to_owned(),
                category: "effects".to_owned(),
                documentation: "Set UIStroke.Thickness with `ApplyStrokeMode = Border`; shares the same UIStroke as `border-*`.".to_owned(),
                replacement: None,
                color: None,
                sort_text: None,
            },
            utility_kind: utility_kind.clone(),
        });

        for thickness in RING_THICKNESS_VALUES {
            items.push(CompletionSpec {
                item: CompletionItem {
                    label: format!("{family}-{thickness}"),
                    insert_text: format!("{family}-{thickness}"),
                    kind: "utility".to_owned(),
                    category: "effects".to_owned(),
                    documentation: format!("Set UIStroke.Thickness to `{thickness}`."),
                    replacement: None,
                    color: None,
                    sort_text: None,
                },
                utility_kind: utility_kind.clone(),
            });
        }

        for color_key in color_completion_keys(config) {
            items.push(CompletionSpec {
                item: CompletionItem {
                    label: format!("{family}-{color_key}"),
                    insert_text: format!("{family}-{color_key}"),
                    kind: "utility".to_owned(),
                    category: "color".to_owned(),
                    documentation: format!("Set UIStroke.Color from theme color `{color_key}`."),
                    replacement: None,
                    color: color_swatch(config, &color_key),
                    sort_text: None,
                },
                utility_kind: utility_kind.clone(),
            });
        }
    }

    for (label, documentation) in [
        (
            "transition".to_owned(),
            "Tween runtime style changes with TweenService (0.15s by default).".to_owned(),
        ),
        (
            "transition-none".to_owned(),
            "Disable the transition; runtime style changes apply instantly.".to_owned(),
        ),
    ] {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: label.clone(),
                insert_text: label,
                kind: "utility".to_owned(),
                category: "effects".to_owned(),
                documentation,
                replacement: None,
                color: None,
                sort_text: None,
            },
            utility_kind: UtilityKind::Transition,
        });
    }

    for (prefix, utility_kind, field) in [
        ("duration", UtilityKind::TransitionDuration, "duration"),
        ("delay", UtilityKind::TransitionDelay, "delay"),
    ] {
        for millis in DURATION_PRESET_VALUES {
            items.push(CompletionSpec {
                item: CompletionItem {
                    label: format!("{prefix}-{millis}"),
                    insert_text: format!("{prefix}-{millis}"),
                    kind: "utility".to_owned(),
                    category: "effects".to_owned(),
                    documentation: format!("Set the transition {field} to `{millis}ms`."),
                    replacement: None,
                    color: None,
                    sort_text: None,
                },
                utility_kind: utility_kind.clone(),
            });
        }
    }

    for (key, description) in ANIMATION_VALUES {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: format!("animate-{key}"),
                insert_text: format!("animate-{key}"),
                kind: "utility".to_owned(),
                category: "effects".to_owned(),
                documentation: description.to_owned(),
                replacement: None,
                color: None,
                sort_text: None,
            },
            utility_kind: UtilityKind::Animation,
        });
    }

    for (key, style, direction) in EASE_VALUES {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: format!("ease-{key}"),
                insert_text: format!("ease-{key}"),
                kind: "utility".to_owned(),
                category: "effects".to_owned(),
                documentation: format!(
                    "Set the transition easing to `Enum.EasingStyle.{style}` / `Enum.EasingDirection.{direction}`."
                ),
                replacement: None,
                color: None,
                sort_text: None,
            },
            utility_kind: UtilityKind::TransitionEase,
        });
    }

    for (label, utility_kind, axis) in [
        ("divide-x", UtilityKind::DivideX, "vertical"),
        ("divide-y", UtilityKind::DivideY, "horizontal"),
    ] {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: label.to_owned(),
                insert_text: label.to_owned(),
                kind: "utility".to_owned(),
                category: "layout".to_owned(),
                documentation: format!(
                    "Insert a 1px {axis} separator frame between children (not for LayoutOrder lists)."
                ),
                replacement: None,
                color: None,
                sort_text: None,
            },
            utility_kind: utility_kind.clone(),
        });

        for thickness in RING_THICKNESS_VALUES {
            items.push(CompletionSpec {
                item: CompletionItem {
                    label: format!("{label}-{thickness}"),
                    insert_text: format!("{label}-{thickness}"),
                    kind: "utility".to_owned(),
                    category: "layout".to_owned(),
                    documentation: format!(
                        "Insert a {thickness}px {axis} separator frame between children."
                    ),
                    replacement: None,
                    color: None,
                    sort_text: None,
                },
                utility_kind: utility_kind.clone(),
            });
        }
    }

    for color_key in color_completion_keys(config) {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: format!("divide-{color_key}"),
                insert_text: format!("divide-{color_key}"),
                kind: "utility".to_owned(),
                category: "color".to_owned(),
                documentation: format!(
                    "Paint the divide separators from theme color `{color_key}`."
                ),
                replacement: None,
                color: color_swatch(config, &color_key),
                sort_text: None,
            },
            utility_kind: UtilityKind::DivideColor,
        });
    }

    for (prefix, utility_kind, sides) in [
        ("m", UtilityKind::Margin(PaddingKind::All), "all sides"),
        (
            "mx",
            UtilityKind::Margin(PaddingKind::X),
            "the left and right",
        ),
        (
            "my",
            UtilityKind::Margin(PaddingKind::Y),
            "the top and bottom",
        ),
        ("mt", UtilityKind::Margin(PaddingKind::Top), "the top"),
        ("mr", UtilityKind::Margin(PaddingKind::Right), "the right"),
        ("mb", UtilityKind::Margin(PaddingKind::Bottom), "the bottom"),
        ("ml", UtilityKind::Margin(PaddingKind::Left), "the left"),
    ] {
        for key in spacing_completion_keys(config) {
            items.push(CompletionSpec {
                item: CompletionItem {
                    label: format!("{prefix}-{key}"),
                    insert_text: format!("{prefix}-{key}"),
                    kind: "utility".to_owned(),
                    category: "layout".to_owned(),
                    documentation: format!(
                        "Wrap the element in a margin box padded by spacing `{key}` on {sides}."
                    ),
                    replacement: None,
                    color: None,
                    sort_text: None,
                },
                utility_kind: utility_kind.clone(),
            });
        }
    }

    for (prefix, utility_kind) in [
        ("-mt", UtilityKind::Margin(PaddingKind::Top)),
        ("-ml", UtilityKind::Margin(PaddingKind::Left)),
    ] {
        for key in spacing_completion_keys(config) {
            items.push(CompletionSpec {
                item: CompletionItem {
                    label: format!("{prefix}-{key}"),
                    insert_text: format!("{prefix}-{key}"),
                    kind: "utility".to_owned(),
                    category: "layout".to_owned(),
                    documentation: format!(
                        "Shift Position by negative spacing `{key}` (margin pull)."
                    ),
                    replacement: None,
                    color: None,
                    sort_text: None,
                },
                utility_kind: utility_kind.clone(),
            });
        }
    }

    for (label, utility_kind, axis) in [
        ("mx-auto", UtilityKind::CenterX, "X"),
        ("my-auto", UtilityKind::CenterY, "Y"),
    ] {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: label.to_owned(),
                insert_text: label.to_owned(),
                kind: "utility".to_owned(),
                category: "layout".to_owned(),
                documentation: format!(
                    "Center the element on the {axis} axis via AnchorPoint and Position."
                ),
                replacement: None,
                color: None,
                sort_text: None,
            },
            utility_kind: utility_kind.clone(),
        });
    }

    items.push(CompletionSpec {
        item: CompletionItem {
            label: "grid".to_owned(),
            insert_text: "grid".to_owned(),
            kind: "utility".to_owned(),
            category: "layout".to_owned(),
            documentation: "Add a Roblox UIGridLayout ordered by LayoutOrder.".to_owned(),
            replacement: None,
            color: None,
            sort_text: None,
        },
        utility_kind: UtilityKind::Grid,
    });

    for (prefix, utility_kind, direction) in [
        ("grid-cols", UtilityKind::GridColumns, "Horizontal"),
        ("grid-rows", UtilityKind::GridRows, "Vertical"),
    ] {
        for count in 1..=GRID_CELL_COUNT_MAX {
            items.push(CompletionSpec {
                item: CompletionItem {
                    label: format!("{prefix}-{count}"),
                    insert_text: format!("{prefix}-{count}"),
                    kind: "utility".to_owned(),
                    category: "layout".to_owned(),
                    documentation: format!(
                        "Add a Roblox UIGridLayout with `FillDirection = Enum.FillDirection.{direction}` and `FillDirectionMaxCells = {count}`."
                    ),
                    replacement: None,
                    color: None,
                    sort_text: None,
                },
                utility_kind: utility_kind.clone(),
            });
        }
    }

    for key in size_completion_keys(config) {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: format!("basis-{key}"),
                insert_text: format!("basis-{key}"),
                kind: "utility".to_owned(),
                category: "layout".to_owned(),
                documentation: format!("Set the main-axis (row) size from `basis-{key}`."),
                replacement: None,
                color: None,
                sort_text: None,
            },
            utility_kind: UtilityKind::Basis,
        });
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
                color: None,
                sort_text: None,
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
                color: None,
                sort_text: None,
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
                color: None,
                sort_text: None,
            },
            utility_kind: UtilityKind::FontWeight,
        });
    }

    for (key, value) in LINE_HEIGHT_VALUES {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: format!("leading-{key}"),
                insert_text: format!("leading-{key}"),
                kind: "utility".to_owned(),
                category: "typography".to_owned(),
                documentation: format!("Set Roblox LineHeight to `{value}`."),
                replacement: None,
                color: None,
                sort_text: None,
            },
            utility_kind: UtilityKind::LineHeight,
        });
    }

    for (label, documentation, utility_kind) in [
        (
            "uppercase",
            "Uppercase the element's Text (ASCII letters only).",
            UtilityKind::TextTransform,
        ),
        (
            "lowercase",
            "Lowercase the element's Text (ASCII letters only).",
            UtilityKind::TextTransform,
        ),
        (
            "capitalize",
            "Uppercase the first ASCII letter of each word in the element's Text.",
            UtilityKind::TextTransform,
        ),
        (
            "normal-case",
            "Remove the text transform.",
            UtilityKind::TextTransform,
        ),
        (
            "underline",
            "Enable RichText and wrap the escaped Text in `<u>...</u>`.",
            UtilityKind::TextDecoration,
        ),
        (
            "line-through",
            "Enable RichText and wrap the escaped Text in `<s>...</s>`.",
            UtilityKind::TextDecoration,
        ),
        (
            "no-underline",
            "Remove the text decoration.",
            UtilityKind::TextDecoration,
        ),
    ] {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: label.to_owned(),
                insert_text: label.to_owned(),
                kind: "utility".to_owned(),
                category: "typography".to_owned(),
                documentation: documentation.to_owned(),
                replacement: None,
                color: None,
                sort_text: None,
            },
            utility_kind,
        });
    }

    for (key, style) in FONT_STYLE_VALUES {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: key.to_owned(),
                insert_text: key.to_owned(),
                kind: "utility".to_owned(),
                category: "typography".to_owned(),
                documentation: format!("Set Roblox FontFace style to `Enum.FontStyle.{style}`."),
                replacement: None,
                color: None,
                sort_text: None,
            },
            utility_kind: UtilityKind::FontStyle,
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
                color: None,
                sort_text: None,
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
                color: None,
                sort_text: None,
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
                color: None,
                sort_text: None,
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
            color: None,
            sort_text: None,
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
                color: None,
                sort_text: None,
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
            color: None,
            sort_text: None,
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
                color: None,
                sort_text: None,
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
                color: color_swatch(config, &color_key),
                sort_text: None,
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
                color: None,
                sort_text: None,
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
                    color: color_swatch(config, &color_key),
                    sort_text: None,
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
                    color: None,
                    sort_text: None,
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
                    color: None,
                    sort_text: None,
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
                color: None,
                sort_text: None,
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
            color: None,
            sort_text: None,
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
                color: None,
                sort_text: None,
            },
            utility_kind: UtilityKind::FlexItem,
        });
    }

    items
}
