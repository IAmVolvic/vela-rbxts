---
"@rbxts/vela-runtime": minor
"@vela-rbxts/compiler": minor
"vela-rbxts": minor
---

Ship the runtime as `@rbxts/vela-runtime` instead of copying it into every file.

The runtime resolver used to be inlined whole into every module that needed it. A
place with ten components that use a variant carried ten copies of the same 5,500
lines, and each copy ran its own camera subscription, its own rem binding and its
own React context. In the reference app one `App.luau` was 190,260 bytes, of which
about 167,000 was the runtime.

It is now one ModuleScript the whole place shares, and a transformed module gets
an import and the config it hands the host:

```ts
import { createVelaRuntimeHost } from "@rbxts/vela-runtime";
const VelaRuntimeHost = createVelaRuntimeHost({ /* … */ });
```

That same `App.luau` is 43,187 bytes — 22.7% of what it was — and the runtime is
166,682 bytes once, however many files reach it.

**Setup is unchanged.** The package installs as a dependency of `vela-rbxts`, and
it sits under the `@rbxts` scope on purpose: roblox-ts only resolves a package
whose scope directory is one of the project's `typeRoots`, and `node_modules/@rbxts`
is the one every roblox-ts project already lists and every Rojo template already
maps. Nothing to add to `tsconfig.json`, nothing to add to the Rojo project.

Three things the inlined shape had forced:

- `__VelaOpacity` kept its React context and provider on `_G`, because a
  `createContext` per copy made one context per module and the alpha could never
  cross a component boundary. The context is now simply created once.
- `__VelaRem` opened a `CurrentCamera` subscription per module. One now.
- The emit numbers rem slots from zero in each file, so the slot table moved out
  of the namespace and onto a per-module scaler (`createVelaRemScaler`) — a shared
  table would have handed one module the binding its neighbour built.

The motion driver still resolves from the transformed module rather than from the
package, so a `plugins.motion.module` specifier keeps the rule it always had: a
package name or a `baseUrl`-relative path, never a relative one. The specifier no
longer travels to the runtime in the config, which never read it.
