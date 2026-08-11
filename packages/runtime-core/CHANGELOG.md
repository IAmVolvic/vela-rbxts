# @rbxts/vela-runtime-core

## 0.12.4

## 0.12.3

### Patch Changes

- 3c2d451: Read a class the way it is written rather than the way whitespace splits it.

  Two shapes were reported as broken while being perfectly ordinary. A template
  interpolation splices into the class beside it, so `` `w-[${width}]` `` reaches
  the editor as `w-[` and `]`, and both were analyzed as if they were whole
  classes: one unknown theme key and one unsupported family for a class the
  compiler defers to the runtime untouched. A token an interpolation cuts into is
  left alone now; a token that merely sits next to one, with a space between, is
  checked as before.

  The second shape was not editor-only. Whitespace inside an arbitrary value split
  it into pieces, so `w-[calc(100% - 4px)]` was read as `w-[calc(100%`, `-` and
  `4px)]`, and both the editor and the compiler reported three diagnostics about
  fragments instead of one about the value. Whitespace stops separating classes
  between a `[` and the `]` that closes it. A bracket that never closes still
  splits, so the classes written behind a typo go on applying, and sorting moves
  such a value as the one class it is rather than refusing to touch the value it
  sits in.

  The runtime splits class strings in Luau rather than in the compiler, so it
  carries the same rule: a static class and a deferred one tokenize alike.

## 0.12.2

## 0.12.1

## 0.12.0

### Patch Changes

- 3b1fbd9: Ship the runtime core as a module per namespace.

  The core was one 5,180-line file holding fifteen namespaces, four of which
  referenced each other in a cycle that no split could have survived: Luau
  resolves a `require` when the module loads, so a cycle between two scripts is
  an error rather than a slow path.

  Four helpers moved to break it — `isWholeNumber` to `__VelaLua`,
  `opacityToTransparency` and the two alignment resolvers to `__VelaValue`, and
  `colorPropEffect` to `__VelaToken`, beside the other effect constructors it is
  only ever called from. The namespaces then split into one module each, with the
  shared types in their own, and the package's entry point re-exports all of them
  under the names it always had.

  Consumers import the same names from the same specifier. What changes is the
  shipped artifact: the package is now a ModuleScript with a child per namespace
  rather than a single script.
