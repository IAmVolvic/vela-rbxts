---
"vela-rbxts": minor
"@vela-rbxts/rbxtsc-host": patch
---

Add a `vela` CLI that lowers a source tree ahead of `rbxtsc`, so a project can use Vela without registering the transform plugin.

`vela build` mirrors `src` into `.vela/src`, transforming the `.tsx` files that use `className` and copying everything else through unchanged; `vela watch` re-transforms on change. Point `compilerOptions.rootDir` and `include` at the generated tree and drop the `vela-rbxts/transformer` plugin entry — the CLI warns when either is still wired for the transformer. Both paths run the same compiler and emit identical Luau.

Diagnostics keep the transformer's anchoring against your real sources, and `vela build` exits non-zero when a file fails to compile. Pruning is driven by a manifest of what the CLI emitted, so a file it never wrote is never deleted.

Project configs are now cached by content in the `rbxtsc` host, which stops a whole-tree run from transpiling and evaluating `vela.config.ts` once per source file.
