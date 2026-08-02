---
"@vela-rbxts/compiler": patch
---

Stop emitting the deprecated `table.getn` from the inlined runtime host. The
array-length helper aliased it locally because an earlier `.length` spelling
compiled straight through as a nil field, but Luau's script analysis flags
every `table.getn` reference as deprecated in consumer places. The helper now
uses `size()`, which roblox-ts lowers to the `#` operator.
