use crate::ir::model::{HelperEntry, PropEntry};
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{
        ArrowExpr, BlockStmtOrExpr, Expr, Ident, IdentName, JSXAttr, JSXAttrName, JSXAttrOrSpread,
        JSXAttrValue, JSXElement, JSXElementChild, JSXElementName, JSXExpr, JSXExprContainer,
        JSXOpeningElement,
    },
};

pub(crate) fn create_prop_attr(prop: PropEntry) -> JSXAttrOrSpread {
    let PropEntry { name, value } = prop;
    create_prop_attr_with_expr(name.to_string(), parse_expression(&value))
}

pub(crate) fn create_prop_attr_cast_any(prop: PropEntry) -> JSXAttrOrSpread {
    let PropEntry { name, value } = prop;
    create_prop_attr_with_expr(
        name.to_string(),
        parse_expression(&format!("({value} as never)")),
    )
}

pub(crate) fn create_prop_attr_with_expr(name: String, expr: Box<Expr>) -> JSXAttrOrSpread {
    JSXAttrOrSpread::JSXAttr(JSXAttr {
        span: DUMMY_SP,
        name: JSXAttrName::Ident(IdentName::new(name.into(), DUMMY_SP)),
        value: Some(JSXAttrValue::JSXExprContainer(JSXExprContainer {
            span: DUMMY_SP,
            expr: JSXExpr::Expr(expr),
        })),
    })
}

pub(crate) fn create_helper_child(helper: HelperEntry) -> JSXElementChild {
    create_helper_child_with_expr(helper, create_prop_attr)
}

pub(crate) fn create_helper_child_cast_any(helper: HelperEntry) -> JSXElementChild {
    create_helper_child_with_expr(helper, create_prop_attr_cast_any)
}

fn create_helper_child_with_expr(
    helper: HelperEntry,
    create_prop_attr: fn(PropEntry) -> JSXAttrOrSpread,
) -> JSXElementChild {
    JSXElementChild::JSXElement(Box::new(JSXElement {
        span: DUMMY_SP,
        opening: JSXOpeningElement {
            name: JSXElementName::Ident(Ident::new_no_ctxt(helper.tag.into(), DUMMY_SP)),
            span: DUMMY_SP,
            attrs: helper.props.into_iter().map(create_prop_attr).collect(),
            self_closing: true,
            type_args: None,
        },
        children: vec![],
        closing: None,
    }))
}

/// The namespace both targets' runtimes export their opacity helpers under.
/// What `Provider` and `Fade` are shaped like is the target's business.
pub(crate) const OPACITY_NAMESPACE: &str = "__VelaOpacity";

/// Vide reads a `Derivable<T>`: a function value on a non-event property becomes
/// an effect. Wrapping is what keeps an expression re-readable, since nothing
/// there re-renders to read it again.
pub(crate) fn thunk(expr: Expr) -> Expr {
    Expr::Arrow(ArrowExpr {
        span: DUMMY_SP,
        params: Vec::new(),
        body: Box::new(BlockStmtOrExpr::Expr(Box::new(expr))),
        is_async: false,
        is_generator: false,
        type_params: None,
        return_type: None,
        ctxt: Default::default(),
    })
}

/// The body of a zero-parameter arrow, which is how a deferred class value is
/// written. Anything else is handed back untouched.
pub(crate) fn deferred_body(expr: &Expr) -> Option<&Expr> {
    let Expr::Arrow(arrow) = expr else {
        return None;
    };
    if !arrow.params.is_empty() || arrow.is_async || arrow.is_generator {
        return None;
    }

    match &*arrow.body {
        BlockStmtOrExpr::Expr(body) => Some(body),
        BlockStmtOrExpr::BlockStmt(_) => None,
    }
}

pub(crate) fn parse_expression(value: &str) -> Box<Expr> {
    crate::swc::parse::parse_expression(value)
}
