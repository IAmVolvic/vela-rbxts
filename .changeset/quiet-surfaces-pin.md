---
"@vela-rbxts/compiler": patch
"@vela-rbxts/config": patch
"@rbxts/vela-runtime": patch
"@rbxts/vela-runtime-core": patch
"@rbxts/vela-runtime-vide": patch
---

Keep the literal pixels under a `SurfaceGui`, which is drawn on a part rather
than on the screen.

Every pixel offset follows the viewport since rem landed, and a surface UI
followed it too: a `SurfaceGui` takes its pixel space from the part it is on and
its `PixelsPerStud`, and a `BillboardGui` sizes itself the same way, so the
viewport says nothing about either. A panel written to fit its part grew and
shrank with the player's screen instead, and closing the clamp to stop it took
the scaling away from the screen UI as well.

Both containers are pinned now, on the static path and on the runtime path
alike. The pin is opened by the container element in the JSX: what is written
under it lexically lowers to literal offsets in the emit, and a component
rendered there, compiled in a file of its own, reads the pin at its root and is
handed back the offsets it was written with. `theme.rem.pinnedUnder` names the
containers this applies to, and emptying it puts them back on the curve.

A `SurfaceGui` the compiler never sees, one built in Luau or in another file
that a React root is mounted into, is outside what this can reach; such a
project still pins with `theme.rem: { min: 16, max: 16 }`.
