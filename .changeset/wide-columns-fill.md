---
"@vela-rbxts/compiler": patch
"@rbxts/vela-runtime-core": patch
---

Add `justify-stretch`, the class that reaches `UIListLayout.HorizontalFlex`.

The two flex properties Roblox exposes are named for absolute axes rather than
for the main and the cross one, and vela follows that: `justify-*` writes the
horizontal axis, `items-*` and `content-*` the vertical. `items-stretch` reached
`VerticalFlex` from the first, but the only values that reached `HorizontalFlex`
were `between`, `around` and `evenly`, so a column that wanted its children to
fill the width had no class to say it with.

Tailwind spells the same value `justify-stretch`, and that is what it lowers to
here, on the static path and on the runtime one alike.
