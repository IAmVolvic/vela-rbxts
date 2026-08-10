use crate::api::Diagnostic;
#[cfg(not(target_arch = "wasm32"))]
use crate::api::EditorOptions;
use crate::config::defaults::default_config;
use crate::config::merge::resolve_config_input as merge_resolve_config_input;
use crate::config::model::{TailwindConfig, TailwindConfigInput};

#[cfg(not(target_arch = "wasm32"))]
pub(crate) fn parse_config(config_json: Option<&str>) -> TailwindConfig {
    parse_config_with_diagnostic(config_json).0
}

/// Falls back to the default theme on malformed JSON, reporting the failure so
/// direct napi consumers do not get their config silently ignored.
pub(crate) fn parse_config_with_diagnostic(
    config_json: Option<&str>,
) -> (TailwindConfig, Option<Diagnostic>) {
    let Some(value) = config_json else {
        return (default_config(), None);
    };

    match parse_config_json(value) {
        Ok(config) => (config, None),
        Err(error) => (
            default_config(),
            Some(Diagnostic {
                level: "error".to_owned(),
                code: "invalid-config-json".to_owned(),
                message: format!(
                    "configJson is not a valid vela config ({error}); compiling against the default theme instead."
                ),
                token: None,
                range: None,
            }),
        ),
    }
}

#[cfg(not(target_arch = "wasm32"))]
pub(crate) fn parse_editor_config(options: Option<&EditorOptions>) -> TailwindConfig {
    parse_config(options.and_then(|value| value.config_json.as_deref()))
}

pub(crate) fn parse_config_json(value: &str) -> Result<TailwindConfig, serde_json::Error> {
    serde_json::from_str::<TailwindConfig>(value).or_else(|_| {
        serde_json::from_str::<TailwindConfigInput>(value)
            .map(|input| merge_resolve_config_input(input, &default_config()))
    })
}

pub(crate) use crate::config::merge::resolve_config_input;
