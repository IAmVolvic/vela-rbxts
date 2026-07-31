---
"@vela-rbxts/compiler": patch
---

Fix a variant colour leaving the base opacity modifier in place, so
`bg-blue-600/50 hover:bg-blue-600` stayed half transparent on hover instead of
turning opaque. A variant resolves in isolation and then overlays the base at
runtime, so dropping the transparency prop from its own bundle never reached
the base value — the variant now states the opaque value when anything else in
the same class list set that family's transparency.
