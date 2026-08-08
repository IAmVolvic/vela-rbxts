# @vela-rbxts/rbxtsc-host

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
