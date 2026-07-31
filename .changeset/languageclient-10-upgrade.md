---
"vela-rbxts-lsp": patch
---

Move the VS Code extension to `vscode-languageclient` 10, which raises the
minimum VS Code version to 1.91. The old client pinned `minimatch` 5, the last
line still resolving `brace-expansion` 2.x, and that is what kept the repository
on a package flagged by GHSA-mh99-v99m-4gvg.
