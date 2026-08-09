pub(crate) mod react;
pub(crate) mod vide;

use crate::config::model::TailwindConfig;
use crate::transform::runtime_host::RuntimeNeeds;
use swc_core::ecma::ast::{Expr, JSXAttrOrSpread, JSXElement, JSXElementChild, ModuleItem};

/// What the IR to JSX bake has to spell differently per UI library. Everything
/// above it — tokenization, utility resolution, the style IR — is shared, and
/// so is every prop and helper child the static path writes: Vide reads the
/// same lowercase host tags and the same Roblox property names React does.
///
/// Only the reactive seams diverge, because Vide has no re-render.
pub(crate) trait EmitTarget {
    /// The preamble a transformed module opens with: the runtime import, and
    /// whatever the file needs constructed out of it.
    fn runtime_module_items(
        &self,
        config: &TailwindConfig,
        needs: &RuntimeNeeds<'_>,
    ) -> Vec<ModuleItem>;

    /// The binding `runtime_module_items` declared for the runtime host, which
    /// is what a lowered element is retagged to.
    fn host_element_name(&self) -> &'static str;

    /// The expressions the emitted branch rules decide on, as one attribute the
    /// host reads by index.
    fn tests_attr(&self, tests: Vec<Expr>) -> JSXAttrOrSpread;

    /// The runtime's opacity provider, wrapped around what the static fade
    /// could not reach.
    fn opacity_provider(&self, alpha: f64, children: Vec<JSXElementChild>) -> Box<JSXElement>;

    /// What a provider's child has to look like by the time it is placed. React
    /// reads the context during the child's own render, so the child travels as
    /// it is; Vide builds a child eagerly, before the provider that would have
    /// scoped it ever runs, so it travels as a thunk instead.
    fn opacity_provider_child(&self, child: JSXElementChild) -> JSXElementChild;

    /// The runtime's fade consumer, wrapped around what a component returns.
    fn fade_element(&self, child: Expr) -> Box<JSXElement>;
}

pub(crate) fn react_target() -> &'static dyn EmitTarget {
    static TARGET: react::ReactTarget = react::ReactTarget;
    &TARGET
}

pub(crate) fn vide_target() -> &'static dyn EmitTarget {
    static TARGET: vide::VideTarget = vide::VideTarget;
    &TARGET
}

pub(crate) fn target_for(framework: crate::config::model::Framework) -> &'static dyn EmitTarget {
    match framework {
        crate::config::model::Framework::React => react_target(),
        crate::config::model::Framework::Vide => vide_target(),
    }
}
