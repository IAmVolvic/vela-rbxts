---
"@rbxts/vela-runtime": minor
"@vela-rbxts/compiler": minor
"vela-rbxts": minor
---

Lower the `/N` color opacity modifier on every family that has a transparency
channel.

`bg-blue-600/50` already worked; `border-slate-500/25`, `divide-white/10` and the
gradient stops did not. `border-*` reported the modifier as a missing theme key,
and the rest reported `unsupported-opacity-modifier` — so a class list carried
over from Tailwind lost exactly the alpha it was written for.

Each family now lowers the modifier to the channel Roblox actually gives it:

- `border-{color}/N` → `UIStroke.Transparency`
- `divide-{color}/N` → the separator frames' `BackgroundTransparency`
- `from-*/N`, `via-*/N`, `to-*/N` → a `UIGradient.Transparency` sequence whose
  keypoints line up with the color stops, so one faded stop does not fade the
  others

The runtime resolver reads the same modifiers off a dynamic class value, and the
prop parser learned `NumberSequence`, which a variant bundle needs to restate a
faded gradient.

`placeholder-*` is the one family left: Roblox has no placeholder transparency,
and fading the text itself would take the typed value with it. It still reports
`unsupported-opacity-modifier`, now with a message that says why.

Editor surfaces follow: a `/N` token gets its swatch and hover back instead of
being read as a theme key that does not exist.
