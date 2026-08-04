use crate::api::Diagnostic;
use crate::class_value::collapse::collapse_class_value_expr;
use crate::class_value::scope::ClassValueScopeStack;
use crate::diagnostics::compiler::{
    decoration_on_richtext_diagnostic, motion_on_component_diagnostic,
};
use crate::ir::model::{PropEntry, StyleIr, TextSpec};
use crate::swc::builders::{
    create_helper_child, create_helper_child_cast_any, create_opacity_provider, create_prop_attr,
    create_prop_attr_cast_any,
};
use crate::transform::fade::{
    fade_component_function, fade_component_initializer, is_component_binding,
};
use crate::transform::jsx::{
    element_expression_source, is_component_element, lower_class_name,
    unsupported_host_class_name_diagnostic,
};
use crate::transform::module::{
    create_opacity_module_items, create_runtime_host_module_items, element_tag_name,
    is_supported_host_element,
};
use crate::transform::opacity::{compose_inherited_opacity, static_opacity_alpha};
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{
        BlockStmt, DefaultDecl, ExportDefaultDecl, Expr, FnDecl, Ident, JSXAttr, JSXAttrName,
        JSXAttrOrSpread, JSXAttrValue, JSXClosingElement, JSXElement, JSXElementChild,
        JSXElementName, JSXEmptyExpr, JSXExpr, JSXExprContainer, JSXFragment, Module, Pat, Str,
        VarDecl, VarDeclKind, VarDeclarator,
    },
    ecma::visit::{Visit, VisitMut, VisitMutWith, VisitWith},
};

pub(crate) struct VelaTransformer {
    pub(crate) changed: bool,
    pub(crate) config: crate::config::model::TailwindConfig,
    pub(crate) diagnostics: Vec<Diagnostic>,
    pub(crate) ir: Vec<StyleIr>,
    pub(crate) runtime_host_needed: bool,
    /// Whether a fade left the static path and needs the runtime's opacity
    /// helpers, which a file can need without needing the whole host.
    pub(crate) opacity_helper_needed: bool,
    pub(crate) class_value_scopes: ClassValueScopeStack,
    /// The alpha every enclosing `opacity-*` has left for this element. 1 is
    /// opaque, and the root starts there.
    pub(crate) opacity_alpha: f64,
}

impl VisitMut for VelaTransformer {
    fn visit_mut_module(&mut self, module: &mut Module) {
        self.class_value_scopes.push();
        module.visit_mut_children_with(self);
        self.class_value_scopes.pop();

        // The host already carries the opacity namespace, so a file that needs
        // both inlines the runtime once.
        if self.runtime_host_needed {
            let mut runtime_items = create_runtime_host_module_items(&self.config);
            runtime_items.append(&mut module.body);
            module.body = runtime_items;
        } else if self.opacity_helper_needed {
            let mut opacity_items = create_opacity_module_items();
            opacity_items.append(&mut module.body);
            module.body = opacity_items;
        }
    }

    fn visit_mut_block_stmt(&mut self, block: &mut BlockStmt) {
        self.class_value_scopes.push();
        block.visit_mut_children_with(self);
        self.class_value_scopes.pop();
    }

    // A component defined here is rendered from somewhere this pass cannot see,
    // so the fade that reaches it arrives as context. Its root is where that is
    // read, and the instances it lowered statically are faded from there.
    fn visit_mut_fn_decl(&mut self, declaration: &mut FnDecl) {
        declaration.visit_mut_children_with(self);

        if is_component_binding(&declaration.ident.sym)
            && fade_component_function(&mut declaration.function)
        {
            self.opacity_helper_needed = true;
            self.changed = true;
        }
    }

    fn visit_mut_export_default_decl(&mut self, declaration: &mut ExportDefaultDecl) {
        declaration.visit_mut_children_with(self);

        let DefaultDecl::Fn(function) = &mut declaration.decl else {
            return;
        };
        if fade_component_function(&mut function.function) {
            self.opacity_helper_needed = true;
            self.changed = true;
        }
    }

    fn visit_mut_var_declarator(&mut self, declarator: &mut VarDeclarator) {
        declarator.visit_mut_children_with(self);

        let Pat::Ident(binding) = &declarator.name else {
            return;
        };
        if !is_component_binding(&binding.id.sym) {
            return;
        }

        let Some(init) = declarator.init.as_deref_mut() else {
            return;
        };
        if fade_component_initializer(init) {
            self.opacity_helper_needed = true;
            self.changed = true;
        }
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

    // A fragment carries no instance and no class, but it does carry children,
    // and the fade running through it still has to reach the ones it cannot see.
    fn visit_mut_jsx_fragment(&mut self, fragment: &mut JSXFragment) {
        fragment.visit_mut_children_with(self);
        if self.opacity_alpha < 1.0 {
            let alpha = self.opacity_alpha;
            self.provide_unreachable_opacity_children(&mut fragment.children, alpha);
        }
    }

    fn visit_mut_jsx_element(&mut self, element: &mut JSXElement) {
        let is_component = is_component_element(&element.opening.name);
        let is_host = is_supported_host_element(&element.opening.name);
        let element_tag =
            (is_host && !is_component).then(|| element_tag_name(&element.opening.name));

        let inherited_alpha = self.opacity_alpha;
        // A component renders its children wherever it likes, and the provider
        // wrapped around it reaches them there. Fading them here as well would
        // apply the same alpha twice.
        self.opacity_alpha = if is_component {
            1.0
        } else {
            self.subtree_opacity_alpha(element, element_tag.as_deref())
        };
        element.visit_mut_children_with(self);
        if self.opacity_alpha < 1.0 {
            let alpha = self.opacity_alpha;
            self.provide_unreachable_opacity_children(&mut element.children, alpha);
        }
        self.opacity_alpha = inherited_alpha;

        if !is_host && !is_component {
            if let Some(diagnostic) = unsupported_host_class_name_diagnostic(
                &element.opening.name,
                &element.opening.attrs,
            ) {
                self.diagnostics.push(diagnostic);
            }
            return;
        }

        let Some(mut lowered) = lower_class_name(
            &element.opening.attrs,
            &self.config,
            element_tag.as_deref(),
            &self.class_value_scopes,
            &mut self.diagnostics,
        ) else {
            // An element with no `className` still sits inside the fade, and it
            // is the common case: a plain `<textlabel Text="…" />`.
            if inherited_alpha < 1.0 && element_tag.is_some() {
                self.apply_inherited_opacity_attrs(
                    element,
                    element_tag.as_deref(),
                    inherited_alpha,
                );
            }
            if is_component {
                self.provide_component_opacity(element, inherited_alpha);
            }
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

        // A component element has no channel of its own to fade, so its own
        // `opacity-*` joins what it inherited and travels on as one alpha.
        let component_alpha = inherited_alpha * lowered.style_ir.opacity_alpha.unwrap_or(1.0);

        // A class value that only exists at render time resolves tokens this
        // pass never sees, so the runtime host fades whatever it resolves —
        // variant rules included. Everything statically known is faded here.
        let inherited_opacity_at_runtime =
            component_alpha < 1.0 && lowered.style_ir.runtime_class_value;
        if inherited_alpha < 1.0 && !is_component {
            let declared = declared_prop_names(&lowered.preserved_attrs);
            compose_inherited_opacity(
                &mut lowered.style_ir,
                element_tag.as_deref(),
                inherited_alpha,
                &declared,
                !inherited_opacity_at_runtime,
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

        // The runtime host provides for its own subtree, alpha and all. A
        // component element the static path lowered has no such moment, so the
        // provider is wrapped around it here.
        let component_provider_alpha = if is_component && !needs_runtime_host {
            component_alpha
        } else {
            1.0
        };

        // The runtime host renders this tag itself, so a component has to be
        // forwarded as a reference rather than as a host element name.
        let runtime_tag = if is_component {
            match element_expression_source(&element.opening.name) {
                Some(source) => source,
                None => {
                    self.provide_component_opacity(element, component_alpha);
                    return;
                }
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
                    name: "__velaRules".into(),
                    value: serde_json::to_string(&lowered.style_ir.runtime_rules)
                        .expect("runtime rules must serialize to JSON"),
                }));
            }
            if let Some(transition) = &lowered.style_ir.transition {
                attrs.push(create_prop_attr(PropEntry {
                    name: "__velaTransition".into(),
                    value: serde_json::to_string(transition)
                        .expect("transition must serialize to JSON"),
                }));
            }
            if let Some(animation) = &lowered.style_ir.animation {
                attrs.push(create_prop_attr(PropEntry {
                    name: "__velaAnimation".into(),
                    value: format!("\"{animation}\""),
                }));
            }
            if let Some(text) = &lowered.style_ir.text {
                attrs.push(create_prop_attr(PropEntry {
                    name: "__velaText".into(),
                    value: serde_json::to_string(text).expect("text spec must serialize to JSON"),
                }));
            }
            if let Some(divide) = &lowered.style_ir.divide {
                attrs.push(create_prop_attr(PropEntry {
                    name: "__velaDivide".into(),
                    value: serde_json::to_string(divide)
                        .expect("divide spec must serialize to JSON"),
                }));
            }
            if let Some(margin) = &lowered.style_ir.margin {
                attrs.push(create_prop_attr(PropEntry {
                    name: "__velaMargin".into(),
                    value: serde_json::to_string(margin)
                        .expect("margin spec must serialize to JSON"),
                }));
            }
            if inherited_opacity_at_runtime {
                attrs.push(create_prop_attr(PropEntry {
                    name: "__velaOpacity".into(),
                    value: component_alpha.to_string(),
                }));
            }
            attrs.push(create_prop_attr(PropEntry {
                name: "__velaTag".into(),
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

        if !helper_children.is_empty() {
            if element.opening.self_closing {
                element.opening.self_closing = false;
                element.closing = Some(JSXClosingElement {
                    span: DUMMY_SP,
                    name: element.opening.name.clone(),
                });
                element.children = helper_children;
            } else {
                let existing_children = std::mem::take(&mut element.children);
                element.children = helper_children
                    .into_iter()
                    .chain(existing_children)
                    .collect();
            }
        }

        self.provide_component_opacity(element, component_provider_alpha);
    }
}

impl VelaTransformer {
    /// The alpha this element hands to everything nested inside it.
    fn subtree_opacity_alpha(&self, element: &JSXElement, element_tag: Option<&str>) -> f64 {
        // A CanvasGroup composites its subtree in one pass, so its own
        // `GroupTransparency` already carries the fade for everything below and
        // nothing under it repeats the multiplication.
        if element_tag == Some("canvasgroup") {
            return 1.0;
        }

        self.opacity_alpha
            * self
                .own_opacity_alpha(&element.opening.attrs)
                .unwrap_or(1.0)
    }

    fn own_opacity_alpha(&self, attrs: &[JSXAttrOrSpread]) -> Option<f64> {
        let value = attrs.iter().find_map(|attr| match attr {
            JSXAttrOrSpread::JSXAttr(JSXAttr {
                name: JSXAttrName::Ident(ident),
                value,
                ..
            }) if ident.sym == "className" => value.as_ref(),
            _ => None,
        })?;

        match value {
            JSXAttrValue::Str(literal) => {
                let class_name = literal.value.to_string_lossy();
                static_opacity_alpha(class_name.split_whitespace(), &self.config)
            }
            JSXAttrValue::JSXExprContainer(container) => {
                let JSXExpr::Expr(expr) = &container.expr else {
                    return None;
                };
                let collapse = collapse_class_value_expr(expr, &self.class_value_scopes);
                // A class value settled at render time can name an `opacity-*`
                // this pass never sees, so the whole list is left to the runtime
                // host: it resolves all of it and hands its subtree one alpha,
                // rather than the two of them each fading part of it.
                if collapse.is_dynamic() {
                    return None;
                }
                static_opacity_alpha(collapse.static_tokens, &self.config)
            }
            _ => None,
        }
    }

    /// Children written as JSX are walked and faded with everything else.
    /// Children that arrive as a value are elements this pass never sees, so the
    /// alpha is handed to them at render time instead. A component child needs
    /// the same, and wraps itself on the way past.
    fn provide_unreachable_opacity_children(
        &mut self,
        children: &mut Vec<JSXElementChild>,
        alpha: f64,
    ) {
        for child in children.iter_mut() {
            let unreachable = match child {
                JSXElementChild::JSXExprContainer(container) => match &container.expr {
                    JSXExpr::Expr(expr) => !contains_jsx(expr),
                    JSXExpr::JSXEmptyExpr(_) => false,
                },
                JSXElementChild::JSXSpreadChild(_) => true,
                _ => false,
            };
            if !unreachable {
                continue;
            }

            let wrapped = std::mem::replace(
                child,
                JSXElementChild::JSXExprContainer(JSXExprContainer {
                    span: DUMMY_SP,
                    expr: JSXExpr::JSXEmptyExpr(JSXEmptyExpr { span: DUMMY_SP }),
                }),
            );
            *child = JSXElementChild::JSXElement(create_opacity_provider(alpha, vec![wrapped]));
            self.changed = true;
            self.opacity_helper_needed = true;
        }
    }

    /// Wraps a component element in the runtime's provider. Its instances are
    /// created out of sight of this pass, so the alpha reaches them as context
    /// and lowers against the tags it finds there.
    fn provide_component_opacity(&mut self, element: &mut JSXElement, alpha: f64) {
        if alpha >= 1.0 {
            return;
        }

        let mut provider = create_opacity_provider(alpha, Vec::new());
        std::mem::swap(element, provider.as_mut());
        element.children.push(JSXElementChild::JSXElement(provider));
        self.changed = true;
        self.opacity_helper_needed = true;
    }

    /// Fades an element that carries no `className` of its own — a plain
    /// `<textlabel Text="…" />` is still inside the subtree.
    fn apply_inherited_opacity_attrs(
        &mut self,
        element: &mut JSXElement,
        element_tag: Option<&str>,
        alpha: f64,
    ) {
        let mut style = StyleIr::default();
        compose_inherited_opacity(
            &mut style,
            element_tag,
            alpha,
            &declared_prop_names(&element.opening.attrs),
            true,
        );

        if style.base.props.is_empty() {
            return;
        }

        self.changed = true;
        element
            .opening
            .attrs
            .extend(style.base.props.into_iter().map(create_prop_attr));
    }
}

#[derive(Default)]
struct JsxPresence {
    found: bool,
}

impl Visit for JsxPresence {
    fn visit_jsx_element(&mut self, _: &JSXElement) {
        self.found = true;
    }

    fn visit_jsx_fragment(&mut self, _: &JSXFragment) {
        self.found = true;
    }
}

pub(crate) fn contains_jsx(expr: &Expr) -> bool {
    let mut presence = JsxPresence::default();
    expr.visit_with(&mut presence);
    presence.found
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
