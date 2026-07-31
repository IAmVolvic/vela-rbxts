pub(crate) mod colors;
pub(crate) mod completions;
pub(crate) mod diagnostics;
pub(crate) mod hover;

use crate::api::{EditorOptions, EditorRange};
use crate::transform::jsx::is_component_element;
use crate::transform::module::{
    is_class_name_attr, is_supported_host_element, is_supported_host_tag,
};
use swc_core::{
    common::{FileName, SourceMap, sync::Lrc},
    ecma::{
        ast::{
            BinaryOp, Expr, JSXAttrOrSpread, JSXAttrValue, JSXElement, JSXElementName, JSXExpr,
            Lit, Prop, PropName, PropOrSpread,
        },
        parser::{Syntax, TsSyntax, parse_file_as_module},
        visit::{Visit, VisitWith},
    },
};

#[derive(Clone)]
pub(crate) struct ClassNameContext {
    /// `None` when the class name sits on a component rather than a host element.
    pub(crate) element_tag: Option<String>,
    pub(crate) value: String,
    pub(crate) value_range: EditorRange,
}

#[derive(Clone)]
pub(crate) struct ClassToken {
    pub(crate) text: String,
    pub(crate) range: EditorRange,
}

/// Returns the element's class name context: `Some(Some(tag))` for a supported
/// host element, `Some(None)` for a component, and `None` when the transformer
/// would not lower the class name at all.
fn lowered_element_tag(name: &JSXElementName) -> Option<Option<String>> {
    if is_supported_host_element(name) {
        return match name {
            JSXElementName::Ident(ident) => Some(Some(ident.sym.to_string())),
            _ => None,
        };
    }

    if is_component_element(name) {
        return Some(None);
    }

    None
}

pub(crate) struct ClassNameCollector<'a> {
    source: &'a str,
    source_base: u32,
    contexts: Vec<ClassNameContext>,
}

impl ClassNameCollector<'_> {
    fn push_literal(&mut self, element_tag: &Option<String>, span: swc_core::common::Span) {
        let (lo, hi) = span_range(span, self.source_base);
        let (start, end) = literal_content_bytes(self.source, lo, hi);
        self.push_bytes(element_tag, start, end);
    }

    fn push_raw(&mut self, element_tag: &Option<String>, span: swc_core::common::Span) {
        let (lo, hi) = span_range(span, self.source_base);
        self.push_bytes(
            element_tag,
            lo.min(self.source.len()),
            hi.min(self.source.len()),
        );
    }

    fn push_bytes(&mut self, element_tag: &Option<String>, start: usize, end: usize) {
        let Some(value) = self.source.get(start..end) else {
            return;
        };

        self.contexts.push(ClassNameContext {
            element_tag: element_tag.clone(),
            value: value.to_owned(),
            value_range: EditorRange {
                start: byte_to_utf16_position(self.source, start),
                end: byte_to_utf16_position(self.source, end),
            },
        });
    }

    /// Walks the shapes `className={...}` takes in practice — template literals,
    /// conditionals, and `cn()`/`clsx()`-style helpers — so every statically
    /// visible class string reaches the editor features.
    fn collect_expr(&mut self, element_tag: &Option<String>, expr: &Expr) {
        match expr {
            Expr::Paren(paren) => self.collect_expr(element_tag, &paren.expr),
            Expr::TsAs(cast) => self.collect_expr(element_tag, &cast.expr),
            Expr::TsNonNull(non_null) => self.collect_expr(element_tag, &non_null.expr),
            Expr::Lit(Lit::Str(value)) => self.push_literal(element_tag, value.span),
            Expr::Tpl(tpl) => {
                for quasi in &tpl.quasis {
                    self.push_raw(element_tag, quasi.span);
                }
            }
            Expr::Cond(cond) => {
                self.collect_expr(element_tag, &cond.cons);
                self.collect_expr(element_tag, &cond.alt);
            }
            Expr::Bin(bin)
                if matches!(
                    bin.op,
                    BinaryOp::LogicalAnd | BinaryOp::LogicalOr | BinaryOp::NullishCoalescing
                ) =>
            {
                self.collect_expr(element_tag, &bin.left);
                self.collect_expr(element_tag, &bin.right);
            }
            Expr::Array(array) => {
                for element in array.elems.iter().flatten() {
                    self.collect_expr(element_tag, &element.expr);
                }
            }
            Expr::Object(object) => {
                for prop in &object.props {
                    let PropOrSpread::Prop(prop) = prop else {
                        continue;
                    };
                    let Prop::KeyValue(entry) = &**prop else {
                        continue;
                    };
                    match &entry.key {
                        PropName::Str(key) => self.push_literal(element_tag, key.span),
                        PropName::Ident(key) => self.push_raw(element_tag, key.span),
                        _ => {}
                    }
                }
            }
            Expr::Call(call) => {
                for arg in &call.args {
                    self.collect_expr(element_tag, &arg.expr);
                }
            }
            _ => {}
        }
    }
}

impl Visit for ClassNameCollector<'_> {
    fn visit_jsx_element(&mut self, element: &JSXElement) {
        if let Some(element_tag) = lowered_element_tag(&element.opening.name) {
            for attr in &element.opening.attrs {
                let JSXAttrOrSpread::JSXAttr(attr) = attr else {
                    continue;
                };

                if !is_class_name_attr(&attr.name) {
                    continue;
                }

                match &attr.value {
                    Some(JSXAttrValue::Str(value)) => {
                        self.push_literal(&element_tag, value.span);
                    }
                    Some(JSXAttrValue::JSXExprContainer(container)) => {
                        if let JSXExpr::Expr(expr) = &container.expr {
                            self.collect_expr(&element_tag, expr);
                        }
                    }
                    _ => {}
                }
            }
        }

        element.visit_children_with(self);
    }
}

pub(crate) fn parse_editor_config(
    options: Option<&EditorOptions>,
) -> crate::config::model::TailwindConfig {
    crate::config::resolve::parse_editor_config(options)
}

pub(crate) fn class_name_context_at_position(
    source: &str,
    position: u32,
) -> Option<ClassNameContext> {
    collect_class_name_contexts(source)
        .into_iter()
        .find(|context| {
            position >= context.value_range.start && position <= context.value_range.end
        })
}

pub(crate) fn collect_class_tokens(source: &str) -> Vec<ClassToken> {
    collect_class_name_contexts(source)
        .into_iter()
        .flat_map(|context| {
            tokenize_class_name_with_ranges(&context.value, context.value_range.start)
        })
        .collect()
}

pub(crate) fn collect_class_name_contexts(source: &str) -> Vec<ClassNameContext> {
    let cm: Lrc<SourceMap> = Default::default();
    let fm = cm.new_source_file(
        FileName::Custom("input.tsx".into()).into(),
        source.to_owned(),
    );
    // Recovered errors are kept: a half-typed file elsewhere in the module must
    // not blank out the editor features for the JSX that does parse.
    let mut recovered_errors = Vec::new();
    let Ok(module) = parse_file_as_module(
        &fm,
        Syntax::Typescript(TsSyntax {
            decorators: true,
            tsx: true,
            ..Default::default()
        }),
        Default::default(),
        None,
        &mut recovered_errors,
    ) else {
        return lexical_class_name_contexts(source);
    };

    let mut collector = ClassNameCollector {
        source,
        source_base: fm.start_pos.0,
        contexts: Vec::new(),
    };
    module.visit_with(&mut collector);
    collector.contexts
}

/// Last-resort scan for when the file does not parse at all. It cannot tell a
/// host element from a component reliably, so it reports every `className`
/// value it finds and leaves the tag to the caller's best effort.
fn lexical_class_name_contexts(source: &str) -> Vec<ClassNameContext> {
    const ATTR: &str = "className";
    let bytes = source.as_bytes();
    let mut contexts = Vec::new();
    let mut cursor = 0;

    while let Some(found) = source[cursor..].find(ATTR) {
        let start = cursor + found;
        cursor = start + ATTR.len();

        let preceded_by_ident = start
            .checked_sub(1)
            .is_some_and(|index| is_ident_byte(bytes[index]));
        if preceded_by_ident {
            continue;
        }

        let mut index = skip_spaces(bytes, cursor);
        if bytes.get(index) != Some(&b'=') {
            continue;
        }
        index = skip_spaces(bytes, index + 1);

        let element_tag = lexical_element_tag(source, start);
        match bytes.get(index) {
            Some(&quote @ (b'"' | b'\'' | b'`')) => {
                let (content, next) = quoted_content(source, index, quote);
                push_lexical_context(&mut contexts, source, &element_tag, content);
                cursor = next;
            }
            Some(b'{') => {
                let mut depth = 0usize;
                while index < bytes.len() {
                    match bytes[index] {
                        b'{' => depth += 1,
                        b'}' => {
                            depth -= 1;
                            if depth == 0 {
                                index += 1;
                                break;
                            }
                        }
                        quote @ (b'"' | b'\'' | b'`') => {
                            let (content, next) = quoted_content(source, index, quote);
                            push_lexical_context(&mut contexts, source, &element_tag, content);
                            index = next;
                            continue;
                        }
                        _ => {}
                    }
                    index += 1;
                }
                cursor = index;
            }
            _ => {}
        }
    }

    contexts
}

fn push_lexical_context(
    contexts: &mut Vec<ClassNameContext>,
    source: &str,
    element_tag: &Option<String>,
    content: (usize, usize),
) {
    let (start, end) = content;
    if source.get(start..end).is_none() {
        return;
    }

    contexts.push(ClassNameContext {
        element_tag: element_tag.clone(),
        value: source[start..end].to_owned(),
        value_range: EditorRange {
            start: byte_to_utf16_position(source, start),
            end: byte_to_utf16_position(source, end),
        },
    });
}

/// Content byte range of the string opened at `open`, plus the index just past
/// it. An unterminated string ends at the newline so mid-edit values still work.
fn quoted_content(source: &str, open: usize, quote: u8) -> ((usize, usize), usize) {
    let bytes = source.as_bytes();
    let start = open + 1;
    let mut index = start;

    while index < bytes.len() {
        match bytes[index] {
            b'\\' => index += 1,
            b'\n' => return ((start, index), index),
            byte if byte == quote => return ((start, index), index + 1),
            _ => {}
        }
        index += 1;
    }

    ((start, bytes.len()), bytes.len())
}

fn lexical_element_tag(source: &str, attr_start: usize) -> Option<String> {
    let bytes = source.as_bytes();
    let open = source[..attr_start].rfind('<')?;
    let name_start = open + 1;
    let name_end = bytes[name_start..]
        .iter()
        .position(|byte| !is_ident_byte(*byte))
        .map_or(bytes.len(), |offset| name_start + offset);

    // Anything else is a component, whose host element is only known at runtime.
    source
        .get(name_start..name_end)
        .filter(|name| is_supported_host_tag(name))
        .map(str::to_owned)
}

fn is_ident_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'$'
}

fn skip_spaces(bytes: &[u8], mut index: usize) -> usize {
    while index < bytes.len() && bytes[index].is_ascii_whitespace() {
        index += 1;
    }
    index
}

pub(crate) fn span_range(span: swc_core::common::Span, source_base: u32) -> (usize, usize) {
    let start = span.lo.0.saturating_sub(source_base) as usize;
    let end = span.hi.0.saturating_sub(source_base) as usize;
    (start, end)
}

/// Byte range of a quoted literal's contents, excluding the quotes.
pub(crate) fn literal_content_bytes(source: &str, lo: usize, hi: usize) -> (usize, usize) {
    let hi = hi.min(source.len());
    let lo = lo.min(hi);
    let snippet = &source[lo..hi];
    let quote = snippet
        .char_indices()
        .find(|(_, ch)| matches!(ch, '"' | '\''));

    let Some((quote_index, quote_char)) = quote else {
        return (lo, hi);
    };

    let content_start = lo + quote_index + quote_char.len_utf8();
    let content_end = snippet
        .char_indices()
        .rev()
        .find(|(_, ch)| *ch == quote_char)
        .map(|(index, _)| lo + index)
        .filter(|end| *end >= content_start)
        .unwrap_or(hi);

    (content_start, content_end)
}

pub(crate) fn byte_to_utf16_position(source: &str, byte_index: usize) -> u32 {
    source
        .get(..byte_index.min(source.len()))
        .unwrap_or_default()
        .encode_utf16()
        .count() as u32
}

pub(crate) fn utf16_len(value: &str) -> u32 {
    value.encode_utf16().count() as u32
}

pub(crate) fn tokenize_class_name_with_ranges(input: &str, source_offset: u32) -> Vec<ClassToken> {
    let mut tokens = Vec::new();
    let mut token_start: Option<usize> = None;

    for (index, ch) in input.char_indices() {
        if ch.is_whitespace() {
            if let Some(start) = token_start.take() {
                tokens.push(ClassToken {
                    text: input[start..index].to_owned(),
                    range: EditorRange {
                        start: source_offset + utf16_len(&input[..start]),
                        end: source_offset + utf16_len(&input[..index]),
                    },
                });
            }
            continue;
        }

        if token_start.is_none() {
            token_start = Some(index);
        }
    }

    if let Some(start) = token_start {
        tokens.push(ClassToken {
            text: input[start..].to_owned(),
            range: EditorRange {
                start: source_offset + utf16_len(&input[..start]),
                end: source_offset + utf16_len(input),
            },
        });
    }

    tokens
}

pub(crate) fn current_token_replacement(tokens: &[ClassToken], position: u32) -> EditorRange {
    tokens
        .iter()
        .find(|token| position >= token.range.start && position <= token.range.end)
        .map(|token| token.range.clone())
        .unwrap_or(EditorRange {
            start: position,
            end: position,
        })
}

pub(crate) fn current_prefix(
    tokens: &[ClassToken],
    replacement: &EditorRange,
    position: u32,
) -> String {
    let Some(token) = tokens
        .iter()
        .find(|token| token.range.start == replacement.start && token.range.end == replacement.end)
    else {
        return String::new();
    };

    let wanted_len = position.saturating_sub(token.range.start);
    let mut current_len = 0;
    let mut end_index = 0;
    for (index, ch) in token.text.char_indices() {
        let next_len = current_len + ch.len_utf16() as u32;
        if next_len > wanted_len {
            break;
        }
        current_len = next_len;
        end_index = index + ch.len_utf8();
    }

    token.text[..end_index].trim_start().to_owned()
}

pub(crate) fn token_at_position(tokens: &[ClassToken], position: u32) -> Option<ClassToken> {
    tokens
        .iter()
        .find(|token| position >= token.range.start && position <= token.range.end)
        .cloned()
}
