use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use serde::Deserialize;
use tokio::sync::RwLock;
use tower_lsp::jsonrpc::Result;
use tower_lsp::lsp_types::{
    CodeAction, CodeActionKind, CodeActionOrCommand, CodeActionParams,
    CodeActionProviderCapability, CodeActionResponse, Color, ColorInformation, ColorPresentation,
    ColorPresentationParams, ColorProviderCapability, CompletionItem, CompletionItemKind,
    CompletionOptions, CompletionParams, CompletionResponse, CompletionTextEdit, Diagnostic,
    DiagnosticSeverity, DidChangeTextDocumentParams, DidChangeWatchedFilesParams,
    DidCloseTextDocumentParams, DidOpenTextDocumentParams, DocumentColorParams, Hover,
    HoverContents, HoverParams, HoverProviderCapability, InitializeParams, InitializeResult,
    InitializedParams, MarkupContent, MarkupKind, NumberOrString, Position, Range,
    ServerCapabilities, ServerInfo, TextDocumentSyncCapability, TextDocumentSyncKind, TextEdit,
    Url, WorkspaceEdit,
};
use tower_lsp::{Client, LanguageServer};
use vela_rbxts_compiler::{
    CompletionRequest, DiagnosticsRequest, DocumentColor as CompilerDocumentColor,
    DocumentColorsRequest, EditorDiagnostic as CompilerDiagnostic, EditorOptions, HoverRequest,
    get_completions, get_diagnostics, get_document_colors, get_hover,
};

use crate::documents::Document;
use crate::quickfix::rank_suggestions;
use crate::state::{ConfigEntry, ServerState};

const SOURCE_NAME: &str = "vela-rbxts";
const DIAGNOSTICS_DEBOUNCE: Duration = Duration::from_millis(200);
const MAX_REPLACEMENT_SUGGESTIONS: usize = 3;

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InitializationOptions {
    #[serde(default)]
    workspace_root: Option<String>,
    #[serde(default)]
    configs: Vec<ConfigPayload>,
}

#[derive(Debug, Default, Deserialize)]
pub(crate) struct SetConfigsParams {
    #[serde(default)]
    configs: Vec<ConfigPayload>,
}

#[derive(Debug, Deserialize)]
struct ConfigPayload {
    dir: String,
    json: String,
}

impl ConfigPayload {
    fn into_entry(self) -> ConfigEntry {
        ConfigEntry {
            dir: PathBuf::from(self.dir),
            json: self.json,
        }
    }
}

// Thin stdio LSP adapter over the compiler/editor APIs.
pub struct RbxtsLanguageServer {
    client: Client,
    state: Arc<RwLock<ServerState>>,
}

impl RbxtsLanguageServer {
    pub fn new(client: Client) -> Self {
        Self {
            client,
            state: Arc::new(RwLock::new(ServerState::new())),
        }
    }

    async fn snapshot_document(&self, uri: &Url) -> Option<Document> {
        self.state.read().await.document_cloned(uri)
    }

    async fn compiler_editor_options(&self, document: &Document) -> EditorOptions {
        let state = self.state.read().await;
        let config_json = state.config_json_for(document.file_path.as_deref());
        document.editor_options(state.project_root.as_deref(), config_json)
    }

    async fn publish_now(&self, document: &Document) {
        let options = self.compiler_editor_options(document).await;
        publish_diagnostics(&self.client, document, options).await;
    }

    // Coalesces rapid edits: only the most recent document version survives the
    // debounce window and reaches the compiler.
    fn schedule_diagnostics(&self, uri: Url, version: i32) {
        let client = self.client.clone();
        let state = self.state.clone();

        tokio::spawn(async move {
            tokio::time::sleep(DIAGNOSTICS_DEBOUNCE).await;

            let (document, options) = {
                let guard = state.read().await;
                let Some(document) = guard.document_cloned(&uri) else {
                    return;
                };
                if document.version != Some(version) {
                    return;
                }
                let config_json = guard.config_json_for(document.file_path.as_deref());
                let options = document.editor_options(guard.project_root.as_deref(), config_json);
                (document, options)
            };

            publish_diagnostics(&client, &document, options).await;
        });
    }

    async fn refresh_all_diagnostics(&self) {
        let documents = self.state.read().await.open_documents();
        for document in &documents {
            self.publish_now(document).await;
        }
    }

    pub(crate) async fn set_configs(&self, params: SetConfigsParams) -> Result<()> {
        let entries = params
            .configs
            .into_iter()
            .map(ConfigPayload::into_entry)
            .collect();
        {
            let mut state = self.state.write().await;
            state.set_configs(entries);
        }
        self.refresh_all_diagnostics().await;
        Ok(())
    }
}

#[tower_lsp::async_trait]
impl LanguageServer for RbxtsLanguageServer {
    async fn initialize(&self, params: InitializeParams) -> Result<InitializeResult> {
        let options: InitializationOptions = params
            .initialization_options
            .and_then(|value| serde_json::from_value(value).ok())
            .unwrap_or_default();

        let root_uri = params.root_uri.or_else(|| {
            params
                .workspace_folders
                .and_then(|folders| folders.into_iter().next().map(|folder| folder.uri))
        });
        let project_root = root_uri
            .and_then(|uri| uri.to_file_path().ok())
            .or_else(|| options.workspace_root.as_ref().map(PathBuf::from));

        {
            let mut state = self.state.write().await;
            state.set_project_root(project_root);
            state.set_configs(
                options
                    .configs
                    .into_iter()
                    .map(ConfigPayload::into_entry)
                    .collect(),
            );
        }

        self.client
            .log_message(
                tower_lsp::lsp_types::MessageType::INFO,
                "vela-rbxts LSP initialized",
            )
            .await;

        Ok(InitializeResult {
            server_info: Some(ServerInfo {
                name: "vela-rbxts-lsp".to_owned(),
                version: Some(env!("CARGO_PKG_VERSION").to_owned()),
            }),
            capabilities: ServerCapabilities {
                text_document_sync: Some(TextDocumentSyncCapability::Kind(
                    TextDocumentSyncKind::FULL,
                )),
                completion_provider: Some(CompletionOptions {
                    resolve_provider: Some(false),
                    trigger_characters: Some(vec!["-".to_owned(), ":".to_owned()]),
                    ..Default::default()
                }),
                color_provider: Some(ColorProviderCapability::Simple(true)),
                hover_provider: Some(HoverProviderCapability::Simple(true)),
                code_action_provider: Some(CodeActionProviderCapability::Simple(true)),
                ..Default::default()
            },
        })
    }

    async fn initialized(&self, _: InitializedParams) {
        self.client
            .log_message(
                tower_lsp::lsp_types::MessageType::INFO,
                "vela-rbxts LSP ready",
            )
            .await;
    }

    async fn shutdown(&self) -> Result<()> {
        Ok(())
    }

    async fn did_open(&self, params: DidOpenTextDocumentParams) {
        let document = {
            let mut state = self.state.write().await;
            state.upsert_document(
                params.text_document.uri,
                params.text_document.text,
                Some(params.text_document.version),
            )
        };

        self.publish_now(&document).await;
    }

    async fn did_change(&self, params: DidChangeTextDocumentParams) {
        let Some(change) = params.content_changes.into_iter().last() else {
            return;
        };

        let uri = params.text_document.uri;
        let version = params.text_document.version;
        let text = change.text;

        {
            let mut state = self.state.write().await;
            if state
                .update_document(&uri, text.clone(), Some(version))
                .is_none()
            {
                state.upsert_document(uri.clone(), text, Some(version));
            }
        }

        self.schedule_diagnostics(uri, version);
    }

    async fn did_close(&self, params: DidCloseTextDocumentParams) {
        {
            let mut state = self.state.write().await;
            state.remove_document(&params.text_document.uri);
        }

        self.client
            .publish_diagnostics(params.text_document.uri, Vec::new(), None)
            .await;
    }

    async fn did_change_watched_files(&self, _: DidChangeWatchedFilesParams) {
        // The editor watches `vela.config.ts`. The authoritative config payload
        // arrives via `vela-rbxts/setConfigs`, but refresh here too so diagnostics
        // never lag behind a config edit.
        self.refresh_all_diagnostics().await;
    }

    async fn completion(&self, params: CompletionParams) -> Result<Option<CompletionResponse>> {
        let uri = params.text_document_position.text_document.uri;
        let position = params.text_document_position.position;
        let Some(document) = self.snapshot_document(&uri).await else {
            return Ok(None);
        };

        let Some(offset) = document.position_to_offset(position) else {
            return Ok(None);
        };

        let response = get_completions(CompletionRequest {
            source: document.text.clone(),
            position: offset,
            options: Some(self.compiler_editor_options(&document).await),
        });

        if !response.is_in_class_name_context {
            return Ok(None);
        }

        let items = response
            .items
            .into_iter()
            .map(|item| compiler_completion_item_to_lsp(&document, item))
            .collect();

        Ok(Some(CompletionResponse::Array(items)))
    }

    async fn hover(&self, params: HoverParams) -> Result<Option<Hover>> {
        let uri = params.text_document_position_params.text_document.uri;
        let position = params.text_document_position_params.position;
        let Some(document) = self.snapshot_document(&uri).await else {
            return Ok(None);
        };

        let Some(offset) = document.position_to_offset(position) else {
            return Ok(None);
        };

        let response = get_hover(HoverRequest {
            source: document.text.clone(),
            position: offset,
            options: Some(self.compiler_editor_options(&document).await),
        });

        let Some(contents) = response.contents else {
            return Ok(None);
        };

        let hover_range = response
            .range
            .and_then(|range| document.range_to_lsp_range(range.start, range.end))
            .or_else(|| {
                document
                    .offset_to_position(offset)
                    .map(|position| Range::new(position, position))
            });

        Ok(Some(Hover {
            contents: HoverContents::Markup(MarkupContent {
                kind: MarkupKind::Markdown,
                value: format!("{}\n\n{}", contents.display, contents.documentation),
            }),
            range: hover_range,
        }))
    }

    async fn code_action(&self, params: CodeActionParams) -> Result<Option<CodeActionResponse>> {
        let uri = params.text_document.uri.clone();
        let Some(document) = self.snapshot_document(&uri).await else {
            return Ok(None);
        };

        let options = self.compiler_editor_options(&document).await;
        let mut actions: CodeActionResponse = Vec::new();

        for diagnostic in &params.context.diagnostics {
            if diagnostic.source.as_deref() != Some(SOURCE_NAME) {
                continue;
            }

            let Some(token) = diagnostic_token(diagnostic) else {
                continue;
            };

            let suggestions = document
                .position_to_offset(diagnostic.range.start)
                .map(|offset| {
                    let completions = get_completions(CompletionRequest {
                        source: document.text.clone(),
                        position: offset,
                        options: Some(options.clone()),
                    });
                    let labels: Vec<String> = completions
                        .items
                        .into_iter()
                        .map(|item| item.label)
                        .collect();
                    rank_suggestions(&token, &labels, MAX_REPLACEMENT_SUGGESTIONS)
                })
                .unwrap_or_default();

            for (index, suggestion) in suggestions.into_iter().enumerate() {
                actions.push(CodeActionOrCommand::CodeAction(replace_action(
                    &uri,
                    diagnostic,
                    &suggestion,
                    index == 0,
                )));
            }

            actions.push(CodeActionOrCommand::CodeAction(remove_action(
                &uri, diagnostic, &token,
            )));
        }

        if actions.is_empty() {
            return Ok(None);
        }

        Ok(Some(actions))
    }

    async fn document_color(&self, params: DocumentColorParams) -> Result<Vec<ColorInformation>> {
        let uri = params.text_document.uri;
        let Some(document) = self.snapshot_document(&uri).await else {
            return Ok(Vec::new());
        };

        let response = get_document_colors(DocumentColorsRequest {
            source: document.text.clone(),
            options: Some(self.compiler_editor_options(&document).await),
        });

        Ok(response
            .colors
            .into_iter()
            .filter_map(|color| compiler_document_color_to_lsp(&document, color))
            .collect())
    }

    async fn color_presentation(
        &self,
        params: ColorPresentationParams,
    ) -> Result<Vec<ColorPresentation>> {
        let uri = params.text_document.uri;
        let Some(document) = self.snapshot_document(&uri).await else {
            return Ok(Vec::new());
        };

        let response = get_document_colors(DocumentColorsRequest {
            source: document.text.clone(),
            options: Some(self.compiler_editor_options(&document).await),
        });

        let presentations = response
            .colors
            .into_iter()
            .filter_map(|color| {
                let range = document.range_to_lsp_range(color.range.start, color.range.end)?;
                if range != params.range {
                    return None;
                }

                Some(ColorPresentation {
                    label: color.presentation,
                    ..Default::default()
                })
            })
            .collect();

        Ok(presentations)
    }
}

async fn publish_diagnostics(client: &Client, document: &Document, options: EditorOptions) {
    let response = get_diagnostics(DiagnosticsRequest {
        source: document.text.clone(),
        options: Some(options),
    });

    let diagnostics = response
        .diagnostics
        .into_iter()
        .map(|diagnostic| compiler_diagnostic_to_lsp(document, diagnostic))
        .collect();

    client
        .publish_diagnostics(document.uri.clone(), diagnostics, document.version)
        .await;
}

fn diagnostic_token(diagnostic: &Diagnostic) -> Option<String> {
    diagnostic
        .data
        .as_ref()
        .and_then(|data| data.get("token"))
        .and_then(|token| token.as_str())
        .map(|token| token.to_owned())
}

fn replace_action(
    uri: &Url,
    diagnostic: &Diagnostic,
    suggestion: &str,
    preferred: bool,
) -> CodeAction {
    CodeAction {
        title: format!("Replace with `{suggestion}`"),
        kind: Some(CodeActionKind::QUICKFIX),
        diagnostics: Some(vec![diagnostic.clone()]),
        edit: Some(single_edit(uri, diagnostic.range, suggestion.to_owned())),
        is_preferred: Some(preferred),
        ..Default::default()
    }
}

fn remove_action(uri: &Url, diagnostic: &Diagnostic, token: &str) -> CodeAction {
    CodeAction {
        title: format!("Remove `{token}`"),
        kind: Some(CodeActionKind::QUICKFIX),
        diagnostics: Some(vec![diagnostic.clone()]),
        edit: Some(single_edit(uri, diagnostic.range, String::new())),
        ..Default::default()
    }
}

fn single_edit(uri: &Url, range: Range, new_text: String) -> WorkspaceEdit {
    let mut changes = HashMap::new();
    changes.insert(uri.clone(), vec![TextEdit { range, new_text }]);
    WorkspaceEdit {
        changes: Some(changes),
        ..Default::default()
    }
}

fn compiler_completion_item_to_lsp(
    document: &Document,
    item: vela_rbxts_compiler::CompletionItem,
) -> CompletionItem {
    let label = item.label;
    let category = item.category;
    let documentation = item.documentation;
    let insert_text = item.insert_text;
    let replacement = item.replacement;

    let text_edit = replacement.as_ref().and_then(|range| {
        document
            .range_to_lsp_range(range.start, range.end)
            .map(|range| {
                CompletionTextEdit::Edit(TextEdit {
                    range,
                    new_text: insert_text.clone(),
                })
            })
    });

    CompletionItem {
        label: label.clone(),
        kind: Some(map_completion_kind(&category)),
        detail: Some(category.clone()),
        documentation: Some(tower_lsp::lsp_types::Documentation::MarkupContent(
            MarkupContent {
                kind: MarkupKind::Markdown,
                value: documentation,
            },
        )),
        sort_text: Some(match category.as_str() {
            "variant" => format!("0-{}", label),
            _ => format!("1-{}", label),
        }),
        filter_text: Some(label),
        insert_text: Some(insert_text),
        text_edit,
        ..Default::default()
    }
}

fn map_completion_kind(category: &str) -> CompletionItemKind {
    match category {
        "variant" => CompletionItemKind::KEYWORD,
        "radius" | "spacing" | "size" | "color" | "stacking" | "transform" | "effects"
        | "layout" | "utility" => CompletionItemKind::PROPERTY,
        _ => CompletionItemKind::TEXT,
    }
}

fn compiler_diagnostic_to_lsp(document: &Document, diagnostic: CompilerDiagnostic) -> Diagnostic {
    let range = diagnostic
        .range
        .as_ref()
        .and_then(|range| document.range_to_lsp_range(range.start, range.end))
        .unwrap_or_else(|| {
            let position = Position::new(0, 0);
            Range::new(position, position)
        });

    let data = diagnostic
        .token
        .as_ref()
        .map(|token| serde_json::json!({ "token": token }));

    Diagnostic {
        range,
        severity: Some(match diagnostic.level.as_str() {
            "error" => DiagnosticSeverity::ERROR,
            "hint" => DiagnosticSeverity::HINT,
            "info" => DiagnosticSeverity::INFORMATION,
            _ => DiagnosticSeverity::WARNING,
        }),
        code: Some(NumberOrString::String(diagnostic.code)),
        source: Some(SOURCE_NAME.to_owned()),
        message: diagnostic.message,
        data,
        ..Default::default()
    }
}

fn compiler_document_color_to_lsp(
    document: &Document,
    color: CompilerDocumentColor,
) -> Option<ColorInformation> {
    let range = document.range_to_lsp_range(color.range.start, color.range.end)?;

    Some(ColorInformation {
        range,
        color: Color {
            red: color.red as f32,
            green: color.green as f32,
            blue: color.blue as f32,
            alpha: color.alpha as f32,
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_diagnostic(token: Option<&str>) -> Diagnostic {
        Diagnostic {
            range: Range::new(Position::new(0, 4), Position::new(0, 13)),
            source: Some(SOURCE_NAME.to_owned()),
            code: Some(NumberOrString::String("unknown-theme-key".to_owned())),
            message: "unknown".to_owned(),
            data: token.map(|token| serde_json::json!({ "token": token })),
            ..Default::default()
        }
    }

    #[test]
    fn extracts_the_token_from_diagnostic_data() {
        assert_eq!(
            diagnostic_token(&sample_diagnostic(Some("bg-surfac"))).as_deref(),
            Some("bg-surfac")
        );
        assert_eq!(diagnostic_token(&sample_diagnostic(None)), None);
    }

    #[test]
    fn builds_replace_and_remove_edits_over_the_token_range() {
        let uri = Url::parse("file:///ws/App.tsx").unwrap();
        let diagnostic = sample_diagnostic(Some("bg-surfac"));

        let replace = replace_action(&uri, &diagnostic, "bg-surface", true);
        assert_eq!(replace.kind, Some(CodeActionKind::QUICKFIX));
        assert_eq!(replace.is_preferred, Some(true));
        let edits = &replace.edit.unwrap().changes.unwrap()[&uri];
        assert_eq!(edits[0].new_text, "bg-surface");
        assert_eq!(edits[0].range, diagnostic.range);

        let remove = remove_action(&uri, &diagnostic, "bg-surfac");
        let edits = &remove.edit.unwrap().changes.unwrap()[&uri];
        assert_eq!(edits[0].new_text, "");
        assert_eq!(edits[0].range, diagnostic.range);
    }
}
