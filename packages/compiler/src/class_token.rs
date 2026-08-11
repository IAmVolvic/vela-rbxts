use crate::api::EditorRange;

#[derive(Clone)]
pub(crate) struct ClassToken {
    pub(crate) text: String,
    pub(crate) range: EditorRange,
}

pub(crate) fn utf16_len(value: &str) -> u32 {
    value.encode_utf16().count() as u32
}

pub(crate) fn tokenize_class_name_with_ranges(input: &str, source_offset: u32) -> Vec<ClassToken> {
    class_token_ranges(input)
        .into_iter()
        .map(|(start, end)| ClassToken {
            text: input[start..end].to_owned(),
            range: EditorRange {
                start: source_offset + utf16_len(&input[..start]),
                end: source_offset + utf16_len(&input[..end]),
            },
        })
        .collect()
}

/// Byte ranges of the classes in `input`. Whitespace separates classes, except
/// where it sits inside an arbitrary value: `w-[calc(100% - 4px)]` is one class
/// written with spaces, not three broken ones.
pub(crate) fn class_token_ranges(input: &str) -> Vec<(usize, usize)> {
    let mut ranges = Vec::new();
    let mut token_start: Option<usize> = None;
    let mut joined_until = 0usize;

    for (index, ch) in input.char_indices() {
        if ch == '['
            && index >= joined_until
            && let Some(end) = arbitrary_value_end(input, index)
        {
            joined_until = end;
        }

        if ch.is_whitespace() && index >= joined_until {
            if let Some(start) = token_start.take() {
                ranges.push((start, index));
            }
            continue;
        }

        if token_start.is_none() {
            token_start = Some(index);
        }
    }

    if let Some(start) = token_start {
        ranges.push((start, input.len()));
    }

    ranges
}

/// The byte index just past the `]` closing the `[` at `open`, when one closes
/// it. A bracket left open is not an arbitrary value the class text can be read
/// through, so the whitespace behind it goes on separating classes as before.
fn arbitrary_value_end(input: &str, open: usize) -> Option<usize> {
    let mut depth = 0i32;

    for (offset, ch) in input[open..].char_indices() {
        match ch {
            '[' => depth += 1,
            ']' => {
                depth -= 1;
                if depth == 0 {
                    return Some(open + offset + ch.len_utf8());
                }
            }
            _ => {}
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tokens(input: &str) -> Vec<&str> {
        class_token_ranges(input)
            .into_iter()
            .map(|(start, end)| &input[start..end])
            .collect()
    }

    /// The runtime splits class strings in Luau rather than here, so it carries
    /// its own copy of this rule: these cases hold for both.
    #[test]
    fn splits_on_whitespace_outside_an_arbitrary_value() {
        assert_eq!(
            tokens("hover:px-2 w-[calc(100% - 4px)] px-4"),
            ["hover:px-2", "w-[calc(100% - 4px)]", "px-4"]
        );
        assert_eq!(
            tokens("bg-[Color3.fromRGB(255, 136, 0)] p-4"),
            ["bg-[Color3.fromRGB(255, 136, 0)]", "p-4"]
        );
        assert_eq!(tokens("w-[a[b] c] p-4"), ["w-[a[b] c]", "p-4"]);
        assert_eq!(tokens("  p-4   bg-red-500  "), ["p-4", "bg-red-500"]);
        assert!(tokens("").is_empty());
    }

    #[test]
    fn a_bracket_that_never_closes_still_separates_classes() {
        assert_eq!(tokens("w-[calc(100% px-4"), ["w-[calc(100%", "px-4"]);
        assert_eq!(tokens("a w-[ b"), ["a", "w-[", "b"]);
        assert_eq!(tokens("w-["), ["w-["]);
        assert_eq!(tokens("] p-4"), ["]", "p-4"]);
    }
}
