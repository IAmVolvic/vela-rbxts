/// Levenshtein edit distance between two strings, counted in Unicode scalar values.
pub fn levenshtein(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();

    if a.is_empty() {
        return b.len();
    }
    if b.is_empty() {
        return a.len();
    }

    let mut previous: Vec<usize> = (0..=b.len()).collect();
    let mut current = vec![0usize; b.len() + 1];

    for (i, ca) in a.iter().enumerate() {
        current[0] = i + 1;
        for (j, cb) in b.iter().enumerate() {
            let cost = usize::from(ca != cb);
            current[j + 1] = (previous[j + 1] + 1)
                .min(current[j] + 1)
                .min(previous[j] + cost);
        }
        std::mem::swap(&mut previous, &mut current);
    }

    previous[b.len()]
}

/// Ranks completion candidates by closeness to a token that produced a diagnostic,
/// returning up to `max` suggestions within a length-relative edit-distance budget.
pub fn rank_suggestions(token: &str, candidates: &[String], max: usize) -> Vec<String> {
    let threshold = (token.chars().count() / 3).max(1) + 1;

    let mut scored: Vec<(usize, &String)> = candidates
        .iter()
        .filter(|candidate| candidate.as_str() != token)
        .map(|candidate| (levenshtein(token, candidate), candidate))
        .filter(|(distance, _)| *distance <= threshold)
        .collect();

    scored.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(b.1)));
    scored
        .into_iter()
        .take(max)
        .map(|(_, candidate)| candidate.clone())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn measures_edit_distance() {
        assert_eq!(levenshtein("bg-surface", "bg-surface"), 0);
        assert_eq!(levenshtein("bg-surfac", "bg-surface"), 1);
        assert_eq!(levenshtein("", "abc"), 3);
        assert_eq!(levenshtein("kitten", "sitting"), 3);
    }

    #[test]
    fn suggests_closest_valid_tokens() {
        let candidates = vec![
            "bg-surface".to_owned(),
            "bg-slate-500".to_owned(),
            "rounded-md".to_owned(),
            "text-surface".to_owned(),
        ];

        let suggestions = rank_suggestions("bg-surfac", &candidates, 3);
        assert_eq!(suggestions.first().map(String::as_str), Some("bg-surface"));

        // A wildly different token has no close candidate.
        assert!(rank_suggestions("shadow-md", &candidates, 3).is_empty());
    }

    #[test]
    fn excludes_the_token_itself_and_caps_results() {
        let candidates = vec![
            "z-10".to_owned(),
            "z-20".to_owned(),
            "z-30".to_owned(),
            "z-40".to_owned(),
        ];

        let suggestions = rank_suggestions("z-10", &candidates, 2);
        assert_eq!(suggestions.len(), 2);
        assert!(!suggestions.contains(&"z-10".to_owned()));
    }
}
