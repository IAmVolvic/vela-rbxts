---
"@vela-rbxts/compiler": patch
---

Scope the inlined runtime host so a file with enough parts of its own still
compiles.

Luau caps a function at 200 local registers, and a module body is a function.
The runtime was inlined as ~96 top-level declarations, which every transformed
file paid before it declared anything itself — so a component with enough parts
crossed the limit and failed to compile at all, reporting
`Out of local registers when trying to allocate <name>: exceeded limit 200`
against generated code the author never wrote. A six-part `card` hit it at the
second part; the four components beside it were merely close.

The runtime now arrives as a single initializer, so the module body spends one
register on it instead of ninety-six. Type declarations stay outside it: they
cost no register, and the host cast names one of them.

Measured on the rbxts harness, module-scope locals in an emitted file went from
96 to 12.

The runtime source moved out of a string literal in the Rust crate and into
`packages/runtime/src/index.ts`, which the compiler reads at build time. It is
not published and consumers install nothing — the point is that the runtime is
now real TypeScript the repo typechecks and formats, which it could never do
while it was a string. That alone caught a live brace error in it.
