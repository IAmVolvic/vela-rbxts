---
"@vela-rbxts/compiler": minor
---

Give `grid-cols-*`/`grid-rows-*` a real `CellSize`, and add `auto-rows-*` /
`auto-cols-*` to name the other axis.

`UIGridLayout` stamps `CellSize` onto every child and ignores whatever `Size`
the child set for itself. The grid utilities only ever set `FillDirection`,
`FillDirectionMaxCells` and `CellPadding`, so every cell fell back to Roblox's
100x100 default: a `grid-cols-2` of 430px cards collapsed to 100px squares and
their content spilled across the neighbouring track. `grid-cols-*` was not
merely imprecise, it was unusable.

`grid-cols-N` now divides the axis it fills into N tracks and hands each cell
back its share of the gap — `grid grid-cols-2 gap-2.5` lowers to
`CellSize = new UDim2(0.5, -5, 0, 100)`. `grid-rows-N` does the same on the
vertical axis.

The cross axis needs its own answer, since a column count says nothing about
row height, so `auto-rows-*` and `auto-cols-*` set it from the spacing scale.
Without one it stays at the 100px the engine already used, which is why this is
a minor rather than a patch: existing grids keep their row extent and gain
correct track widths.
