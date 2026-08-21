---
"vela-rbxts-lsp": patch
---

Ship the vela config loader the editor extension is built around.

The extension bundles the loader that evaluates `vela.config.ts` for the language
server, and the VSIX workflow built that bundle without building the loader
package first. esbuild leaves a `require` it cannot resolve inside a try/catch
where it stands and says nothing about it, so packaging went green over a bundle
that had no loader in it, and the published extension read no project config at
all: every key a project defined was checked against the default theme, which is
the failure the release before this one taught the extension to report.

The loader is imported outright now, so a bundle built without it fails the
build. The workflow builds it before the bundle, and packaging refuses a staged
bundle that still resolves the loader at runtime.
