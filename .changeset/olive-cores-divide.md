---
"@rbxts/vela-runtime-core": patch
---

Ship the runtime core as a module per namespace.

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
