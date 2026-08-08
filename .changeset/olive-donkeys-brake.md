---
"@vela-rbxts/runtime": patch
"@vela-rbxts/compiler": patch
---

Fix type errors in the inlined runtime under `noUncheckedIndexedAccess`. A
`className` carrying a state variant such as `hover:bg-amber-400` pulls the
runtime host into the emit, where the consumer's own compiler options typecheck
it — and its indexed reads of parsed call arguments, enum segments, and gradient
stops were typed as if an index could never miss. The runtime now typechecks
under that flag, and is built with it so the seam cannot regress.
