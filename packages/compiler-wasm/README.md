# @vela-rbxts/compiler-wasm

WebAssembly build of the [`vela-rbxts`](https://github.com/astra-void/vela-rbxts) compiler.

Same crate as [`@vela-rbxts/compiler`](https://www.npmjs.com/package/@vela-rbxts/compiler), compiled to `wasm32-unknown-unknown` instead of a native N-API addon, so `className` lowering can run somewhere the platform binary cannot be loaded — a browser, most notably. The docs site's playground uses it to lower what you type with the real compiler rather than an imitation of it.

Build tooling should keep using `@vela-rbxts/compiler`: the native addon is faster, and `rbxtsc` runs on Node.

Only `transform` is exposed. The editor APIs the LSP uses (completions, hover, diagnostics, document colors) are native-only.

## Usage

The module is a [`wasm-pack`](https://drager.github.io/wasm-pack) `web` target build: the wasm has to be instantiated before any export is called.

```ts
import init, { transform } from "@vela-rbxts/compiler-wasm";
// Bundler-resolved URL for the payload. Vite, webpack and friends emit it as
// an asset; without a bundler, point this at wherever you serve the file from.
import wasmUrl from "@vela-rbxts/compiler-wasm/vela_compiler_bg.wasm?url";

await init({ module_or_path: wasmUrl });

const result = transform(`<frame className="p-4 bg-slate-800" />`, {
  // Optional: a *resolved* config, as `defineConfig` from
  // `@vela-rbxts/config` returns it. Omitted means the built-in defaults.
  configJson: undefined,
});

result.code; // lowered source
result.diagnostics; // [{ level, code, message, token, range }]
```

## License

MIT
