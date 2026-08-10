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
