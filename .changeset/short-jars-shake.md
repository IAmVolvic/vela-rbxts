---
"@vela-rbxts/compiler": patch
---

Leave a class value's whitespace where its author put it when sorting, and stop
offering a placeholder color the compiler turns down.

Sorting rebuilt the value by joining the tokens with single spaces, so a class
list written across several lines came back as one long line. The tokens are the
only thing the sort is asked to move, so the whitespace between them is carried
over as it was written.

`placeholder-transparent` was offered by completion on a `textbox` and then
reported as unsupported the moment it was accepted, because Roblox has no
placeholder transparency for it to lower to. Every other family that takes the
keyword keeps it.
