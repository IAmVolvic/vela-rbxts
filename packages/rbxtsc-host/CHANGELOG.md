# @vela-rbxts/rbxtsc-host

## 0.12.5

### Patch Changes

- Updated dependencies [d1d3538]
  - @vela-rbxts/compiler@0.12.5
  - @vela-rbxts/config@0.12.5
  - @vela-rbxts/ir@0.12.5

## 0.12.4

### Patch Changes

- Updated dependencies [de7e6ea]
- Updated dependencies [de7e6ea]
  - @vela-rbxts/compiler@0.12.4
  - @vela-rbxts/config@0.12.4
  - @vela-rbxts/ir@0.12.4
  - @vela-rbxts/types@0.12.4

## 0.12.3

### Patch Changes

- Updated dependencies [3c2d451]
- Updated dependencies [3c2d451]
  - @vela-rbxts/compiler@0.12.3
  - @vela-rbxts/config@0.12.3
  - @vela-rbxts/ir@0.12.3
  - @vela-rbxts/types@0.12.3

## 0.12.2

### Patch Changes

- Updated dependencies [0e83027]
  - @vela-rbxts/compiler@0.12.2
  - @vela-rbxts/config@0.12.2
  - @vela-rbxts/ir@0.12.2
  - @vela-rbxts/types@0.12.2

## 0.12.1

### Patch Changes

- 7e27a1e: Let a `vela.config.ts` reach the framework inference.

  The tsconfig `jsxFactory` only decided the framework for a project whose config
  never named one, and that was read off the export. `defineConfig` resolves an
  unset framework to the default before returning, so every config that went
  through it looked like it had asked for React, and a Vide project had to name
  `framework: "vide"` by hand after all.

  The resolved configs `defineConfig` hands back are tracked now, so only an
  export it did not produce is read as a declaration.

  - @vela-rbxts/compiler@0.12.1
  - @vela-rbxts/config@0.12.1
  - @vela-rbxts/ir@0.12.1
  - @vela-rbxts/types@0.12.1

## 0.12.0

### Patch Changes

- fcea92a: Bring the Vide host to parity with the React one.

  The static path was already identical; everything here was on the runtime host.

  Three of the host's own props were never filtered out of the static
  passthrough. `__velaTransition`, `__velaAnimation` and `__velaText` are emitted
  for every target, and only `__velaMargin`/`__velaDivide` had been named — so a
  `transition-*`, an `animate-*` or a text transform beside a variant reached
  `Instance` and threw there. They are one set now rather than a chain of name
  comparisons.

  A rule that stopped matching wrote `nil`. Every prop a rule can name is bound,
  and Vide writes whatever the thunk returns, so a variant with no static
  counterpart — `hover:font-bold` on an element that declares no `FontFace` —
  took the tree down as it was created. React drops the prop and the reconciler
  restores the class default; the fallback now reads that default off the class.

  Also fixed: the inherited alpha composed once per bound prop instead of once
  per resolution, and faded that much more each time; a component tag lost its
  children to the array part of the props table, where only a host tag reads
  them; and every element with a dynamic class value grew a margin wrapper it had
  not asked for, moving its layout props onto a frame between it and its parent.

  Text transforms and motion now run on the Vide host — `uppercase`/`underline`
  through the shared Text pipeline, `transition-*` as a per-prop tween and
  `animate-*` as a preset under `cleanup()`, both on the same neutral driver seam
  `plugins.motion` replaces for React. The fade consumer walks the subtree it is
  handed rather than only its root, stopping at a `CanvasGroup` that already
  composites its own.

  `framework` is inferred from the nearest `tsconfig.json` when the project does
  not name one: a `jsxFactory` of `Vide.jsx` selects Vide.

- Updated dependencies [4fbd38d]
- Updated dependencies [6b06e22]
- Updated dependencies [7a9fde7]
- Updated dependencies [7a9fde7]
- Updated dependencies [7a9fde7]
- Updated dependencies [7a9fde7]
- Updated dependencies [7a9fde7]
- Updated dependencies [7a9fde7]
- Updated dependencies [5a31e51]
  - @vela-rbxts/compiler@0.12.0
  - @vela-rbxts/config@0.12.0
  - @vela-rbxts/ir@0.12.0
  - @vela-rbxts/types@0.12.0

## 0.11.1

### Patch Changes

- Updated dependencies [c71a864]
  - @vela-rbxts/compiler@0.11.1
  - @vela-rbxts/config@0.11.1
  - @vela-rbxts/ir@0.11.1
  - @vela-rbxts/types@0.11.1

## 0.11.0

### Patch Changes

- 7802618: Add a `vela` CLI that lowers a source tree ahead of `rbxtsc`, so a project can use Vela without registering the transform plugin.

  `vela build` mirrors `src` into `.vela/src`, transforming the `.tsx` files that use `className` and copying everything else through unchanged; `vela watch` re-transforms on change. Point `compilerOptions.rootDir` and `include` at the generated tree and drop the `vela-rbxts/transformer` plugin entry — the CLI warns when either is still wired for the transformer. Both paths run the same compiler and emit identical Luau.

  Diagnostics keep the transformer's anchoring against your real sources, and `vela build` exits non-zero when a file fails to compile. Pruning is driven by a manifest of what the CLI emitted, so a file it never wrote is never deleted.

  Project configs are now cached by content in the `rbxtsc` host, which stops a whole-tree run from transpiling and evaluating `vela.config.ts` once per source file.

  - @vela-rbxts/compiler@0.11.0
  - @vela-rbxts/config@0.11.0
  - @vela-rbxts/ir@0.11.0
  - @vela-rbxts/types@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [3724fbd]
- Updated dependencies [63d44ca]
  - @vela-rbxts/compiler@0.10.0
  - @vela-rbxts/config@0.10.0
  - @vela-rbxts/ir@0.10.0
  - @vela-rbxts/types@0.10.0

## 0.9.0

### Patch Changes

- Updated dependencies [c661947]
- Updated dependencies [c661947]
  - @vela-rbxts/compiler@0.9.0
  - @vela-rbxts/config@0.9.0
  - @vela-rbxts/ir@0.9.0
  - @vela-rbxts/types@0.9.0

## 0.8.0

### Patch Changes

- Updated dependencies [9cea6df]
  - @vela-rbxts/compiler@0.8.0
  - @vela-rbxts/config@0.8.0
  - @vela-rbxts/ir@0.8.0
  - @vela-rbxts/types@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [e464a5a]
- Updated dependencies [e464a5a]
  - @vela-rbxts/compiler@0.7.0
  - @vela-rbxts/config@0.7.0
  - @vela-rbxts/ir@0.7.0
  - @vela-rbxts/types@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [8ff59d9]
- Updated dependencies [354b20b]
- Updated dependencies [b4e5ee1]
  - @vela-rbxts/compiler@0.6.0
  - @vela-rbxts/config@0.6.0
  - @vela-rbxts/ir@0.6.0
  - @vela-rbxts/types@0.6.0

## 0.5.2

### Patch Changes

- Updated dependencies [fe23df6]
  - @vela-rbxts/compiler@0.5.2
  - @vela-rbxts/config@0.5.2
  - @vela-rbxts/ir@0.5.2
  - @vela-rbxts/types@0.5.2

## 0.5.1

### Patch Changes

- @vela-rbxts/compiler@0.5.1
- @vela-rbxts/config@0.5.1
- @vela-rbxts/ir@0.5.1
- @vela-rbxts/types@0.5.1

## 0.5.0

### Patch Changes

- Updated dependencies [7a4dfa4]
- Updated dependencies [c84f22b]
- Updated dependencies [6e20817]
  - @vela-rbxts/compiler@0.5.0
  - @vela-rbxts/config@0.5.0
  - @vela-rbxts/ir@0.5.0
  - @vela-rbxts/types@0.5.0

## 0.4.2

### Patch Changes

- Updated dependencies [fd6d430]
- Updated dependencies [80900eb]
- Updated dependencies [0348ad8]
  - @vela-rbxts/compiler@0.4.2
  - @vela-rbxts/config@0.4.2
  - @vela-rbxts/ir@0.4.2
  - @vela-rbxts/types@0.4.2

## 0.4.1

### Patch Changes

- 04c4e35: Diagnostic quality: malformed `configJson` now reports `invalid-config-json` instead of silently falling back to the default theme, TSX parse failures carry line/column and a source range instead of a debug dump, and an invalid `vela.config.*` export names the failing theme key. The compiler root tarball also stops bundling the publish machine's native binary — platform packages already provide them.
- Updated dependencies [04c4e35]
- Updated dependencies [b5714bc]
  - @vela-rbxts/compiler@0.4.1
  - @vela-rbxts/config@0.4.1
  - @vela-rbxts/ir@0.4.1
  - @vela-rbxts/types@0.4.1
