---
"@vela-rbxts/compiler": patch
---

Fix `order-*` being ignored inside a flex container. The lowered `UIListLayout`
left `SortOrder` at its engine default of `Name`, so children sorted
alphabetically by instance name — `order-1` on a `textlabel` still landed after
`order-2` on a `textbutton` — while `UIGridLayout` already set
`SortOrder = LayoutOrder`. Every `UIListLayout` the compiler emits now sets it,
statically and through the runtime host, unless something else already did.
