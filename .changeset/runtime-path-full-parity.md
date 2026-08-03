---
"@vela-rbxts/compiler": minor
---

Resolve every utility family on the runtime class path.

The runtime host knew about a third of the families the static path lowers, so a
component whose `className` arrives as a value kept losing whatever the subset
did not cover: positioning (`left-*`, `inset-*`, `translate-*`, `origin-*`,
`mx-auto`), the box constraints (`min-w-*`, `max-h-*`, `aspect-*`), the grid
(`grid-cols-*`, `auto-rows-*`), gradients, `ring-*`/`outline-*`, shadows,
`z-*`, `rotate-*`, `scale-*`, `opacity-*`, `order-*`, `leading-*`, `self-*`,
`content-*`, `object-*`, `pointer-events-*`, `space-*`, `whitespace-*`, the
whole ScrollingFrame family and the rest of the text families.

All of them now resolve dynamically with the static semantics: color opacity
modifiers (`bg-blue-600/50`) and arbitrary values (`bg-[#ff0000]`, `w-[120px]`,
`text-[13px]`) included, and the families that only meet at the end — the two
`Size` axes, `Position` and `AnchorPoint`, `FontFace`, a grid track and the gap
it gives back — are composed the way `PendingAxes::flush` composes them.
`font-<family>` resolves too: `theme.fontFamily` now reaches the runtime theme.

A utility the host element cannot carry is dropped rather than applied, mirroring
`is_utility_allowed_on_host` — writing `TextColor3` onto a `Frame` is a hard
Roblox error, not a no-op.

The runtime host also names `UIShadow` by its real class: `@rbxts/react` passes a
tag it does not know straight to `Instance.new`, which is case sensitive, so the
lowercase form would fail to instantiate and unwind the whole tree. The static
path still emits the lowercase tag through JSX and needs its own fix.
