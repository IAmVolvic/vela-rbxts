---
"@vela-rbxts/compiler-wasm": patch
---

Add `@vela-rbxts/compiler-wasm`, a WebAssembly build of the compiler crate. Same source as the native addon, exposing `transform` so class lowering can run where the platform binary cannot be loaded — the docs playground compiles with it in the browser.
