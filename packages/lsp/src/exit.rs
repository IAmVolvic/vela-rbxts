use std::pin::Pin;
use std::task::{Context, Poll, ready};
use tokio::io::{AsyncRead, ReadBuf};

/// tower-lsp ends its read loop on end of input, and handles `exit` without
/// ending it, so a client that sends `exit` and holds the pipe open leaves the
/// server running. Reporting end of input right behind the notification puts
/// the shutdown back on the path tower-lsp already unwinds cleanly.
pub(crate) struct ExitOnNotification<R> {
    inner: R,
    frames: FrameScanner,
    exited: bool,
}

impl<R> ExitOnNotification<R> {
    pub(crate) fn new(inner: R) -> Self {
        Self {
            inner,
            frames: FrameScanner::default(),
            exited: false,
        }
    }
}

impl<R: AsyncRead + Unpin> AsyncRead for ExitOnNotification<R> {
    fn poll_read(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<std::io::Result<()>> {
        let this = self.get_mut();
        if this.exited {
            return Poll::Ready(Ok(()));
        }

        let start = buf.filled().len();
        ready!(Pin::new(&mut this.inner).poll_read(cx, buf))?;

        // The notification is handed over before the end of input is: the
        // service still gets to see the message it is exiting on.
        if this.frames.push(&buf.filled()[start..]) {
            this.exited = true;
        }

        Poll::Ready(Ok(()))
    }
}

#[derive(Default)]
struct FrameScanner {
    pending: Vec<u8>,
    body_len: Option<usize>,
    /// A header this cannot read leaves it unable to say where a body ends, and
    /// guessing risks reading `exit` out of something that is not one.
    lost: bool,
}

impl FrameScanner {
    fn push(&mut self, chunk: &[u8]) -> bool {
        if self.lost || chunk.is_empty() {
            return false;
        }

        self.pending.extend_from_slice(chunk);
        let mut exit = false;

        loop {
            match self.body_len {
                None => {
                    let Some(at) = separator(&self.pending) else {
                        break;
                    };
                    let Some(length) = content_length(&self.pending[..at]) else {
                        self.lost = true;
                        self.pending = Vec::new();
                        break;
                    };
                    self.pending.drain(..at + SEPARATOR.len());
                    self.body_len = Some(length);
                }
                Some(length) => {
                    if self.pending.len() < length {
                        break;
                    }
                    let body: Vec<u8> = self.pending.drain(..length).collect();
                    self.body_len = None;
                    exit |= is_exit(&body);
                }
            }
        }

        exit
    }
}

const SEPARATOR: &[u8] = b"\r\n\r\n";

fn separator(bytes: &[u8]) -> Option<usize> {
    bytes
        .windows(SEPARATOR.len())
        .position(|window| window == SEPARATOR)
}

fn content_length(header: &[u8]) -> Option<usize> {
    std::str::from_utf8(header)
        .ok()?
        .split("\r\n")
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            if !name.trim().eq_ignore_ascii_case("content-length") {
                return None;
            }
            value.trim().parse().ok()
        })
}

fn is_exit(body: &[u8]) -> bool {
    // Every frame passes through here, and a document is a frame: parsing each
    // one again to read a method off it is worth skipping when the method the
    // body would need is not written in it anywhere.
    if !body.windows(6).any(|window| window == b"\"exit\"") {
        return false;
    }

    serde_json::from_slice::<serde_json::Value>(body)
        .ok()
        .and_then(|message| Some(message.get("method")?.as_str()? == "exit"))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame(body: &str) -> Vec<u8> {
        format!("Content-Length: {}\r\n\r\n{body}", body.len()).into_bytes()
    }

    #[test]
    fn reports_the_exit_notification() {
        let mut frames = FrameScanner::default();

        assert!(!frames.push(&frame(r#"{"jsonrpc":"2.0","id":1,"method":"shutdown"}"#)));
        assert!(frames.push(&frame(r#"{"jsonrpc":"2.0","method":"exit","params":null}"#)));
    }

    #[test]
    fn reads_a_notification_split_across_reads() {
        let message = frame(r#"{"jsonrpc":"2.0","method":"exit"}"#);
        let mut frames = FrameScanner::default();

        for at in 1..message.len() {
            let mut frames = FrameScanner::default();
            assert!(!frames.push(&message[..at]));
            assert!(frames.push(&message[at..]));
        }

        assert!(frames.push(&message));
    }

    /// A document that says `"exit"` is not a client that asked to exit.
    #[test]
    fn ignores_the_method_written_inside_a_document() {
        let body = r#"{"jsonrpc":"2.0","method":"textDocument/didOpen","params":{"textDocument":{"text":"const method = \"exit\";"}}}"#;
        let mut frames = FrameScanner::default();

        assert!(!frames.push(&frame(body)));
    }

    #[test]
    fn reads_the_header_name_in_any_case() {
        let body = r#"{"jsonrpc":"2.0","method":"exit"}"#;
        let mut frames = FrameScanner::default();
        let message = format!("content-length: {}\r\n\r\n{body}", body.len());

        assert!(frames.push(message.as_bytes()));
    }

    #[test]
    fn stops_scanning_a_stream_it_cannot_frame() {
        let mut frames = FrameScanner::default();

        assert!(!frames.push(b"Content-Length: nonsense\r\n\r\n"));
        assert!(!frames.push(&frame(r#"{"jsonrpc":"2.0","method":"exit"}"#)));
    }
}
