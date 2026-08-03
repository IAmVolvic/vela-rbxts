use crate::api::Diagnostic;
use crate::class_value::scope::ClassValueScopeStack;
use crate::diagnostics::compiler::{
    decoration_on_richtext_diagnostic, motion_on_component_diagnostic,
};
use crate::ir::model::{PropEntry, StyleIr, TextSpec};
use crate::swc::builders::{
    create_helper_child, create_helper_child_cast_any, create_prop_attr, create_prop_attr_cast_any,
};
use crate::transform::jsx::{
    element_expression_source, is_component_element, lower_class_name,
    unsupported_host_class_name_diagnostic,
};
use crate::transform::module::{
    create_runtime_host_module_items, element_tag_name, is_supported_host_element,
};
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{
        BlockStmt, Ident, JSXAttr, JSXAttrName, JSXAttrOrSpread, JSXAttrValue, JSXClosingElement,
        JSXElement, JSXElementName, Module, Pat, Str, VarDecl, VarDeclKind,
    },
    ecma::visit::{VisitMut, VisitMutWith},
};

pub(crate) struct VelaTransformer {
    pub(crate) changed: bool,
    pub(crate) config: crate::config::model::TailwindConfig,
    pub(crate) diagnostics: Vec<Diagnostic>,
    pub(crate) ir: Vec<StyleIr>,
    pub(crate) runtime_host_needed: bool,
    pub(crate) class_value_scopes: ClassValueScopeStack,
}

impl VisitMut for VelaTransformer {
    fn visit_mut_module(&mut self, module: &mut Module) {
        self.class_value_scopes.push();
        module.visit_mut_children_with(self);
        self.class_value_scopes.pop();

        if self.runtime_host_needed {
            let mut runtime_items = create_runtime_host_module_items(&self.config);
            runtime_items.append(&mut module.body);
            module.body = runtime_items;
        }
    }

    fn visit_mut_block_stmt(&mut self, block: &mut BlockStmt) {
        self.class_value_scopes.push();
        block.visit_mut_children_with(self);
        self.class_value_scopes.pop();
    }

    fn visit_mut_var_decl(&mut self, var_decl: &mut VarDecl) {
        for declarator in &mut var_decl.decls {
            declarator.visit_mut_with(self);

            if var_decl.kind != VarDeclKind::Const {
                continue;
            }

            let Some(init) = declarator.init.as_deref() else {
                continue;
            };

            let Some(value) = crate::class_value::collapse::evaluate_constant_truthiness(
                init,
                &self.class_value_scopes,
            ) else {
                continue;
            };

            let Pat::Ident(binding) = &declarator.name else {
                continue;
            };

            self.class_value_scopes
                .insert(binding.id.sym.to_string(), value);
        }
    }

    fn visit_mut_jsx_element(&mut self, element: &mut JSXElement) {
        element.visit_mut_children_with(self);

        let is_component = is_component_element(&element.opening.name);
        if !is_supported_host_element(&element.opening.name) && !is_component {
            if let Some(diagnostic) = unsupported_host_class_name_diagnostic(
                &element.opening.name,
                &element.opening.attrs,
            ) {
                self.diagnostics.push(diagnostic);
            }
            return;
        }

        let element_tag = (!is_component).then(|| element_tag_name(&element.opening.name));

        let Some(mut lowered) = lower_class_name(
            &element.opening.attrs,
            &self.config,
            element_tag.as_deref(),
            &self.class_value_scopes,
            &mut self.diagnostics,
        ) else {
            return;
        };

        if is_component
            && (lowered.style_ir.transition.is_some() || lowered.style_ir.animation.is_some())
        {
            self.diagnostics.push(motion_on_component_diagnostic());
            lowered.style_ir.transition = None;
            lowered.style_ir.animation = None;
        }

        // A component decides its own rendering, so there is no Roblox default
        // to neutralize and no attribute list that speaks for the instance.
        if self.config.preflight && !is_component {
            crate::transform::runtime::apply_preflight(
                &mut lowered.style_ir,
                &declared_prop_names(&lowered.preserved_attrs),
            );
        }

        // A consumer-managed RichText would be double-escaped by the decoration
        // wrapper, so the decoration backs off with a warning.
        if lowered
            .style_ir
            .text
            .as_ref()
            .is_some_and(|text| text.decoration.is_some())
            && has_attr(&lowered.preserved_attrs, "RichText")
        {
            self.diagnostics.push(decoration_on_richtext_diagnostic());
            if let Some(text) = lowered.style_ir.text.as_mut() {
                text.decoration = None;
                if text.transform.is_none() {
                    lowered.style_ir.text = None;
                }
            }
        }

        // A literal `Text` on a static element is transformed at compile time;
        // anything else defers to the runtime host's Text pipeline.
        if !is_component
            && !lowered.needs_runtime_host
            && let Some(spec) = lowered.style_ir.text.clone()
            && apply_static_text_spec(&mut lowered.preserved_attrs, &spec)
        {
            if spec.decoration.is_some() {
                lowered.style_ir.set_prop("RichText", "true".to_owned());
            }
            lowered.style_ir.text = None;
        }

        let needs_runtime_host = lowered.needs_runtime_host || lowered.style_ir.text.is_some();
        lowered.needs_runtime_host = needs_runtime_host;

        // The runtime host renders this tag itself, so a component has to be
        // forwarded as a reference rather than as a host element name.
        let runtime_tag = if is_component {
            match element_expression_source(&element.opening.name) {
                Some(source) => source,
                None => return,
            }
        } else {
            format!("\"{}\"", element_tag_name(&element.opening.name))
        };

        self.changed = true;
        self.ir.push(lowered.style_ir.clone());

        let mut attrs = lowered.preserved_attrs;
        if let Some(runtime_class_name) = lowered.runtime_class_name {
            attrs.push(JSXAttrOrSpread::JSXAttr(runtime_class_name));
        }

        let helper_children = lowered
            .style_ir
            .base
            .helpers
            .into_iter()
            .map(if lowered.needs_runtime_host {
                create_helper_child_cast_any
            } else {
                create_helper_child
            })
            .collect::<Vec<_>>();

        if lowered.needs_runtime_host {
            self.runtime_host_needed = true;
            attrs.extend(
                lowered
                    .style_ir
                    .base
                    .props
                    .into_iter()
                    .map(create_prop_attr_cast_any),
            );
            if !lowered.style_ir.runtime_rules.is_empty() {
                attrs.push(create_prop_attr(PropEntry {
                    name: "__velaRules",
                    value: serde_json::to_string(&lowered.style_ir.runtime_rules)
                        .expect("runtime rules must serialize to JSON"),
                }));
            }
            if let Some(transition) = &lowered.style_ir.transition {
                attrs.push(create_prop_attr(PropEntry {
                    name: "__velaTransition",
                    value: serde_json::to_string(transition)
                        .expect("transition must serialize to JSON"),
                }));
            }
            if let Some(animation) = &lowered.style_ir.animation {
                attrs.push(create_prop_attr(PropEntry {
                    name: "__velaAnimation",
                    value: format!("\"{animation}\""),
                }));
            }
            if let Some(text) = &lowered.style_ir.text {
                attrs.push(create_prop_attr(PropEntry {
                    name: "__velaText",
                    value: serde_json::to_string(text).expect("text spec must serialize to JSON"),
                }));
            }
            if let Some(divide) = &lowered.style_ir.divide {
                attrs.push(create_prop_attr(PropEntry {
                    name: "__velaDivide",
                    value: serde_json::to_string(divide)
                        .expect("divide spec must serialize to JSON"),
                }));
            }
            if let Some(margin) = &lowered.style_ir.margin {
                attrs.push(create_prop_attr(PropEntry {
                    name: "__velaMargin",
                    value: serde_json::to_string(margin)
                        .expect("margin spec must serialize to JSON"),
                }));
            }
            attrs.push(create_prop_attr(PropEntry {
                name: "__velaTag",
                value: runtime_tag,
            }));
            element.opening.name =
                JSXElementName::Ident(Ident::new_no_ctxt("VelaRuntimeHost".into(), DUMMY_SP));
            if let Some(closing) = element.closing.as_mut() {
                closing.name = element.opening.name.clone();
            }
        } else {
            attrs.extend(
                lowered
                    .style_ir
                    .base
                    .props
                    .into_iter()
                    .map(create_prop_attr),
            );
        }

        element.opening.attrs = attrs;

        if element.opening.self_closing && helper_children.is_empty() {
            return;
        }

        if element.opening.self_closing {
            element.opening.self_closing = false;
            element.closing = Some(JSXClosingElement {
                span: DUMMY_SP,
                name: element.opening.name.clone(),
            });
            element.children = helper_children;
            return;
        }

        if helper_children.is_empty() {
            return;
        }

        let existing_children = std::mem::take(&mut element.children);
        element.children = helper_children
            .into_iter()
            .chain(existing_children)
            .collect();
    }
}

fn declared_prop_names(attrs: &[JSXAttrOrSpread]) -> Vec<String> {
    attrs
        .iter()
        .filter_map(|attr| match attr {
            JSXAttrOrSpread::JSXAttr(JSXAttr {
                name: JSXAttrName::Ident(ident),
                ..
            }) => Some(ident.sym.to_string()),
            _ => None,
        })
        .collect()
}

fn has_attr(attrs: &[JSXAttrOrSpread], name: &str) -> bool {
    attrs.iter().any(|attr| {
        matches!(
            attr,
            JSXAttrOrSpread::JSXAttr(JSXAttr {
                name: JSXAttrName::Ident(ident),
                ..
            }) if ident.sym == name
        )
    })
}

/// Rewrites a literal `Text` attribute in place; false when the text is not a
/// static string and has to go through the runtime pipeline instead.
fn apply_static_text_spec(attrs: &mut [JSXAttrOrSpread], spec: &TextSpec) -> bool {
    for attr in attrs {
        let JSXAttrOrSpread::JSXAttr(attr) = attr else {
            continue;
        };
        let JSXAttrName::Ident(ident) = &attr.name else {
            continue;
        };
        if ident.sym != "Text" {
            continue;
        }

        let Some(JSXAttrValue::Str(value)) = &attr.value else {
            return false;
        };

        let mut text = value.value.to_string_lossy().into_owned();
        match spec.transform.as_deref() {
            Some("upper") => text = text.to_ascii_uppercase(),
            Some("lower") => text = text.to_ascii_lowercase(),
            Some("capitalize") => text = capitalize_ascii_words(&text),
            _ => {}
        }
        match spec.decoration.as_deref() {
            Some("underline") => text = format!("<u>{}</u>", escape_rich_text(&text)),
            Some("strike") => text = format!("<s>{}</s>", escape_rich_text(&text)),
            _ => {}
        }

        attr.value = Some(JSXAttrValue::Str(Str {
            span: value.span,
            value: text.into(),
            raw: None,
        }));
        return true;
    }

    false
}

fn capitalize_ascii_words(value: &str) -> String {
    let mut result = String::with_capacity(value.len());
    let mut at_word_start = true;
    for ch in value.chars() {
        if ch.is_ascii_alphabetic() {
            result.push(if at_word_start {
                ch.to_ascii_uppercase()
            } else {
                ch
            });
            at_word_start = false;
        } else {
            result.push(ch);
            at_word_start = !ch.is_ascii_alphanumeric();
        }
    }
    result
}

fn escape_rich_text(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}
