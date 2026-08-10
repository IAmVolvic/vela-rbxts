---
"@rbxts/vela-runtime-vide": patch
"@vela-rbxts/rbxtsc-host": patch
---

Bring the Vide host to parity with the React one.

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
