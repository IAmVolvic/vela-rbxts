---
"vela-rbxts": minor
"@rbxts/vela-runtime": minor
"@rbxts/vela-runtime-vide": minor
---

Keep React out of a Vide place without making anyone name a runtime.

`vela-rbxts` depended on `@rbxts/react` outright, so a Vide project installed
it — and Rojo maps the whole `node_modules/@rbxts` directory into the place,
which is what the three-package runtime split exists to avoid. The Vide host
was not a dependency at all, so the specifier its emit imports did not resolve.

Both hosts ship with `vela-rbxts` now, so neither has to be installed by hand,
and each declares its own UI library as an **optional** peer. A project brings
the library it writes JSX with — it always did — and gets nothing of the other
one. The host it does not emit for is one inert ModuleScript.

The install line is unchanged for React, and a Vide project only swaps
`@rbxts/react` for `@rbxts/vide` and sets `framework: "vide"`.
