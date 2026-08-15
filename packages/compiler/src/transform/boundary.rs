use crate::transform::context::contains_jsx;
use crate::transform::jsx::is_component_element;
use crate::transform::target::EmitTarget;
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

/// Routes what a component returns through the boundary consumer. `forwardRef`
/// and `memo` hand the render function on rather than being one, so the
/// initializer is followed through them.
pub(crate) fn consume_component_initializer(expr: &mut Expr, target: &dyn EmitTarget) -> bool {
    match expr {
        Expr::Arrow(arrow) => consume_arrow(arrow, target),
        Expr::Fn(function) => consume_component_function(&mut function.function, target),
        Expr::Paren(paren) => consume_component_initializer(&mut paren.expr, target),
        Expr::TsAs(cast) => consume_component_initializer(&mut cast.expr, target),
        Expr::TsNonNull(inner) => consume_component_initializer(&mut inner.expr, target),
        Expr::Call(call) => {
            let mut consumed = false;
            for arg in &mut call.args {
                consumed |= consume_component_initializer(&mut arg.expr, target);
            }
            consumed
        }
        _ => false,
    }
}

pub(crate) fn consume_component_function(function: &mut Function, target: &dyn EmitTarget) -> bool {
    match function.body.as_mut() {
        Some(body) => consume_returns(body, target),
        None => false,
    }
}

fn consume_arrow(arrow: &mut ArrowExpr, target: &dyn EmitTarget) -> bool {
    match &mut *arrow.body {
        BlockStmtOrExpr::Expr(expr) => consume_returned_expr(expr, target),
        BlockStmtOrExpr::BlockStmt(body) => consume_returns(body, target),
    }
}

fn consume_returns(body: &mut BlockStmt, target: &dyn EmitTarget) -> bool {
    let mut consumer = ReturnConsumer {
        consumed: false,
        target,
    };
    body.visit_mut_with(&mut consumer);
    consumer.consumed
}

struct ReturnConsumer<'a> {
    consumed: bool,
    target: &'a dyn EmitTarget,
}

impl VisitMut for ReturnConsumer<'_> {
    // A callback declared inside the body renders into this component's own
    // subtree, which the consumer above it already walks. Only what the
    // component itself returns is a root the context has to be read at.
    fn visit_mut_function(&mut self, _: &mut Function) {}

    fn visit_mut_arrow_expr(&mut self, _: &mut ArrowExpr) {}

    fn visit_mut_return_stmt(&mut self, statement: &mut ReturnStmt) {
        if let Some(argument) = statement.arg.as_deref_mut() {
            self.consumed |= consume_returned_expr(argument, self.target);
        }
    }
}

fn consume_returned_expr(expr: &mut Expr, target: &dyn EmitTarget) -> bool {
    if !needs_consumer(expr) {
        return false;
    }

    let returned = std::mem::replace(expr, Expr::Invalid(Invalid { span: DUMMY_SP }));
    *expr = Expr::JSXElement(target.boundary_element(returned));
    true
}

/// A runtime host and a component both resolve against the context themselves,
/// so a root that is one of them needs no consumer of its own. Everything else
/// that renders JSX gets one: a statically lowered instance has no other way to
/// hear about a fade, or a pin, that started outside this file.
fn needs_consumer(expr: &Expr) -> bool {
    match expr {
        Expr::Paren(paren) => needs_consumer(&paren.expr),
        // An instance tag is anything React renders itself, which is more than
        // the tags Vela lowers: a `screengui` root still holds a subtree.
        Expr::JSXElement(element) => !is_component_element(&element.opening.name),
        Expr::JSXFragment(_) => true,
        other => contains_jsx(other),
    }
}
