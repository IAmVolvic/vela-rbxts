---
"@vela-rbxts/compiler": patch
---

Read editor descriptions in rem now that offsets scale with the viewport.

Hover and completion docs still spoke in the units rem retired: `p-4` showed
`new UDim(0, 16)`, `border-2` a bare `2`, `-translate-y-2` "8 pixels". With
scaling active none of those numbers is what actually renders — they are only
the value at `baseResolution`.

A viewport-scaled offset now reads as its rem value first — `` `1rem` (16px at
the base viewport)`` — across padding, gap, margin, sizes, positions, radius,
text size, stroke and separator thickness, and scrollbar width, in hovers and
completion docs alike. The shadow preset hover names `BlurRadius` as the value
that follows the viewport. A config that pins rem (`min = max = base`) keeps
the old pixel wording, matching the emit it produces.
