# vela-rbxts

## 0.11.1

### Patch Changes

- @vela-rbxts/rbxtsc-host@0.11.1
- @vela-rbxts/config@0.11.1
- @vela-rbxts/types@0.11.1

## 0.11.0

### Minor Changes

- 7802618: Add a `vela` CLI that lowers a source tree ahead of `rbxtsc`, so a project can use Vela without registering the transform plugin.

  `vela build` mirrors `src` into `.vela/src`, transforming the `.tsx` files that use `className` and copying everything else through unchanged; `vela watch` re-transforms on change. Point `compilerOptions.rootDir` and `include` at the generated tree and drop the `vela-rbxts/transformer` plugin entry — the CLI warns when either is still wired for the transformer. Both paths run the same compiler and emit identical Luau.

  Diagnostics keep the transformer's anchoring against your real sources, and `vela build` exits non-zero when a file fails to compile. Pruning is driven by a manifest of what the CLI emitted, so a file it never wrote is never deleted.

  Project configs are now cached by content in the `rbxtsc` host, which stops a whole-tree run from transpiling and evaluating `vela.config.ts` once per source file.

### Patch Changes

- Updated dependencies [7802618]
  - @vela-rbxts/rbxtsc-host@0.11.0
  - @vela-rbxts/config@0.11.0
  - @vela-rbxts/types@0.11.0

## 0.10.0

### Patch Changes

- @vela-rbxts/rbxtsc-host@0.10.0
- @vela-rbxts/config@0.10.0
- @vela-rbxts/types@0.10.0

## 0.9.0

### Patch Changes

- @vela-rbxts/rbxtsc-host@0.9.0
- @vela-rbxts/config@0.9.0
- @vela-rbxts/types@0.9.0

## 0.8.0

### Patch Changes

- @vela-rbxts/rbxtsc-host@0.8.0
- @vela-rbxts/config@0.8.0
- @vela-rbxts/types@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [e464a5a]
  - @vela-rbxts/config@0.7.0
  - @vela-rbxts/rbxtsc-host@0.7.0
  - @vela-rbxts/types@0.7.0

## 0.6.0

### Patch Changes

- @vela-rbxts/rbxtsc-host@0.6.0
- @vela-rbxts/config@0.6.0
- @vela-rbxts/types@0.6.0

## 0.5.2

### Patch Changes

- @vela-rbxts/rbxtsc-host@0.5.2
- @vela-rbxts/config@0.5.2
- @vela-rbxts/types@0.5.2

## 0.5.1

### Patch Changes

- @vela-rbxts/config@0.5.1
- @vela-rbxts/rbxtsc-host@0.5.1
- @vela-rbxts/types@0.5.1

## 0.5.0

### Minor Changes

- c84f22b: Neutralize the Roblox host defaults, and add a `preflight` config flag to turn
  that off. Roblox paints every `GuiObject` as an opaque gray box with a 1px
  border, and a framework that only ever adds properties can never take that
  back — so `bg-transparent` had to be repeated on almost every element. Any host
  element carrying a `className` now starts from `BackgroundTransparency = 1` and
  `BorderSizePixel = 0` unless a `bg-*` utility or an explicitly declared prop
  says otherwise, and a background painted by a variant or a dynamic class value
  reopens it. Elements without a `className`, and components, are untouched.

  **Breaking for existing UI:** anywhere the default gray background was
  load-bearing, the element now renders invisible. Add the `bg-*` it was relying
  on, or set `preflight: false` in `vela.config.ts` to keep the old behavior.

### Patch Changes

- Updated dependencies [c84f22b]
  - @vela-rbxts/config@0.5.0
  - @vela-rbxts/rbxtsc-host@0.5.0
  - @vela-rbxts/types@0.5.0

## 0.4.2

### Patch Changes

- @vela-rbxts/rbxtsc-host@0.4.2
- @vela-rbxts/config@0.4.2
- @vela-rbxts/types@0.4.2

## 0.4.1

### Patch Changes

- Updated dependencies [04c4e35]
  - @vela-rbxts/rbxtsc-host@0.4.1
  - @vela-rbxts/config@0.4.1
  - @vela-rbxts/types@0.4.1
