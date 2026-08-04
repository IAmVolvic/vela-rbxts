use crate::swc::builders::create_fade_element;
use crate::transform::context::contains_jsx;
use crate::transform::jsx::is_component_element;
use swc_core::{
    common::DUMMY_SP,
    ecma::{
        ast::{ArrowExpr, BlockStmt, BlockStmtOrExpr, Expr, Function, Invalid, ReturnStmt},
        visit::{VisitMut, VisitMutWith},
    },
};

/// A name React would render as a component: the same rule the JSX side reads a
/// tag by, so a definition and its call sites agree.
pub(crate) fn is_component_binding(name: &str) -> bool {
    name.chars().next().is_some_and(char::is_uppercase)
}

/// Routes what a component returns through the fade consumer. `forwardRef` and
/// `memo` hand the render function on rather than being one, so the initializer
/// is followed through them.
pub(crate) fn fade_component_initializer(expr: &mut Expr) -> bool {
    match expr {
        Expr::Arrow(arrow) => fade_arrow(arrow),
        Expr::Fn(function) => fade_component_function(&mut function.function),
        Expr::Paren(paren) => fade_component_initializer(&mut paren.expr),
        Expr::TsAs(cast) => fade_component_initializer(&mut cast.expr),
        Expr::TsNonNull(inner) => fade_component_initializer(&mut inner.expr),
        Expr::Call(call) => {
            let mut faded = false;
            for arg in &mut call.args {
                faded |= fade_component_initializer(&mut arg.expr);
            }
            faded
        }
        _ => false,
    }
}

pub(crate) fn fade_component_function(function: &mut Function) -> bool {
    match function.body.as_mut() {
        Some(body) => fade_returns(body),
        None => false,
    }
}

fn fade_arrow(arrow: &mut ArrowExpr) -> bool {
    match &mut *arrow.body {
        BlockStmtOrExpr::Expr(expr) => fade_returned_expr(expr),
        BlockStmtOrExpr::BlockStmt(body) => fade_returns(body),
    }
}

fn fade_returns(body: &mut BlockStmt) -> bool {
    let mut fader = ReturnFader { faded: false };
    body.visit_mut_with(&mut fader);
    fader.faded
}

struct ReturnFader {
    faded: bool,
}

impl VisitMut for ReturnFader {
    // A callback declared inside the body renders into this component's own
    // subtree, which the consumer above it already walks. Only what the
    // component itself returns is a root the alpha has to be read at.
    fn visit_mut_function(&mut self, _: &mut Function) {}

    fn visit_mut_arrow_expr(&mut self, _: &mut ArrowExpr) {}

    fn visit_mut_return_stmt(&mut self, statement: &mut ReturnStmt) {
        if let Some(argument) = statement.arg.as_deref_mut() {
            self.faded |= fade_returned_expr(argument);
        }
    }
}

fn fade_returned_expr(expr: &mut Expr) -> bool {
    if !needs_fade(expr) {
        return false;
    }

    let returned = std::mem::replace(expr, Expr::Invalid(Invalid { span: DUMMY_SP }));
    *expr = Expr::JSXElement(create_fade_element(returned));
    true
}

/// A runtime host and a component both resolve against the context themselves,
/// so a root that is one of them needs no consumer of its own. Everything else
/// that renders JSX gets one: a statically lowered instance has no other way to
/// hear about a fade that started outside this file.
fn needs_fade(expr: &Expr) -> bool {
    match expr {
        Expr::Paren(paren) => needs_fade(&paren.expr),
        // An instance tag is anything React renders itself, which is more than
        // the tags Vela lowers: a `screengui` root still holds a subtree.
        Expr::JSXElement(element) => !is_component_element(&element.opening.name),
        Expr::JSXFragment(_) => true,
        other => contains_jsx(other),
    }
}
