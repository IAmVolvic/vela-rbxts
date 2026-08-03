---
"@vela-rbxts/compiler": minor
---

Resolve layout, sizing and text utilities on the runtime class path.

The runtime host implemented a strict subset of the static lowering, so a
component whose `className` comes from a helper — the normal shape for a variant
recipe — silently lost most of its styling: `flex-row`, `items-*`, `justify-*`,
`w-fit`/`h-auto`/`size-fit`, `text-<size>`, `text-left|center|right` and
`font-<weight>` all fell through.

They now resolve with the same semantics the static path uses. `font-<family>`
remains static-only, because the runtime theme carries colors, radius and
spacing but no font families.
