mod documents;
mod exit;
mod quickfix;
mod server;
mod state;
mod translate;

use exit::ExitOnNotification;
use server::RbxtsLanguageServer;
use tokio::io::{stdin, stdout};
use tower_lsp::{LspService, Server};

#[tokio::main]
async fn main() {
    eprintln!("vela-rbxts-lsp: starting stdio LSP server");

    let (service, socket) = LspService::build(RbxtsLanguageServer::new)
        .custom_method("vela-rbxts/setConfigs", RbxtsLanguageServer::set_configs)
        .finish();
    Server::new(ExitOnNotification::new(stdin()), stdout(), socket)
        .serve(service)
        .await;
}
