---
"vela-rbxts-lsp": patch
---

Say so when a `vela.config.ts` fails to load, instead of falling back in silence.

The editor extension evaluates the config and pushes the result to the language
server, which cannot run TypeScript itself. A config the loader could not read
was written to the extension's output channel and nowhere else, and the server
went on checking class names against the default theme, so every key the project
defined read as an unknown one while the same file compiled without complaint.

The failure is raised as a notification now, naming the file and the reason, with
the log one click away. It is not repeated while the reason stays the same, and a
config that loads on a later save clears it.
