use crate::ir::model::{HelperEntry, PropEntry};
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{
        Expr, Ident, IdentName, JSXAttr, JSXAttrName, JSXAttrOrSpread, JSXAttrValue,
        JSXClosingElement, JSXElement, JSXElementChild, JSXElementName, JSXExpr, JSXExprContainer,
        JSXMemberExpr, JSXObject, JSXOpeningElement,
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

fn create_prop_attr_with_expr(name: String, expr: Box<Expr>) -> JSXAttrOrSpread {
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

/// The runtime's opacity provider, wrapped around what the static fade could not
/// reach. It renders no instance of its own, so the tree it wraps keeps its
/// shape, its keys and the names Roblox gives them.
pub(crate) fn create_opacity_provider(
    alpha: f64,
    children: Vec<JSXElementChild>,
) -> Box<JSXElement> {
    let name = JSXElementName::JSXMemberExpr(JSXMemberExpr {
        span: DUMMY_SP,
        obj: JSXObject::Ident(Ident::new_no_ctxt(OPACITY_NAMESPACE.into(), DUMMY_SP)),
        prop: IdentName::new("Provider".into(), DUMMY_SP),
    });

    Box::new(JSXElement {
        span: DUMMY_SP,
        opening: JSXOpeningElement {
            name: name.clone(),
            span: DUMMY_SP,
            attrs: vec![create_prop_attr_with_expr(
                "value".to_owned(),
                parse_expression(&alpha.to_string()),
            )],
            self_closing: false,
            type_args: None,
        },
        children,
        closing: Some(JSXClosingElement {
            span: DUMMY_SP,
            name,
        }),
    })
}

/// The runtime's fade consumer, wrapped around what a component returns. A
/// statically lowered instance cannot read a context, so this is what reads one
/// on its behalf.
pub(crate) fn create_fade_element(child: Expr) -> Box<JSXElement> {
    let name = JSXElementName::JSXMemberExpr(JSXMemberExpr {
        span: DUMMY_SP,
        obj: JSXObject::Ident(Ident::new_no_ctxt(OPACITY_NAMESPACE.into(), DUMMY_SP)),
        prop: IdentName::new("Fade".into(), DUMMY_SP),
    });

    let child = match child {
        Expr::JSXElement(element) => JSXElementChild::JSXElement(element),
        Expr::JSXFragment(fragment) => JSXElementChild::JSXFragment(fragment),
        other => JSXElementChild::JSXExprContainer(JSXExprContainer {
            span: DUMMY_SP,
            expr: JSXExpr::Expr(Box::new(other)),
        }),
    };

    Box::new(JSXElement {
        span: DUMMY_SP,
        opening: JSXOpeningElement {
            name: name.clone(),
            span: DUMMY_SP,
            attrs: Vec::new(),
            self_closing: false,
            type_args: None,
        },
        children: vec![child],
        closing: Some(JSXClosingElement {
            span: DUMMY_SP,
            name,
        }),
    })
}

pub(crate) const OPACITY_NAMESPACE: &str = "__VelaOpacity";

pub(crate) fn parse_expression(value: &str) -> Box<Expr> {
    crate::swc::parse::parse_expression(value)
}
