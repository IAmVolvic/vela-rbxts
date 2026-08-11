pub(crate) mod collapse;
pub(crate) mod scope;

pub(crate) fn tokenize_class_name(input: &str) -> Vec<&str> {
    crate::class_token::class_token_ranges(input)
        .into_iter()
        .map(|(start, end)| &input[start..end])
        .collect()
}
