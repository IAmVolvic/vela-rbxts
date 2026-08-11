---
"@vela-rbxts/lsp": patch
---

Exit on the `exit` notification instead of on the pipe closing behind it.

tower-lsp ends its read loop on end of input and handles `exit` without ending
it, so the notification alone left the server running: a client that sends it
and holds stdin open, as one waiting for the process to go away does, was left
with a server that never went. Editors mostly close the pipe right after and
force-kill on a timeout, which is what kept this out of sight.

The stdin the server reads reports end of input right behind the notification
now, which is the path tower-lsp already unwinds cleanly, and the harness waits
for the process to end on its own rather than killing it after 200ms.
