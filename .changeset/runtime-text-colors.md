---
"@vela-rbxts/compiler": patch
---

Resolve `text-{color}` on the runtime path. A dynamic class value reaches the
inlined runtime host, and that resolver had no `text-` branch at all, so every
text color in one was dropped without a diagnostic — the label kept Roblox's
near-black default and went invisible on any dark surface, while the identical
class string lowered correctly when it happened to be static. Colors now reach
`TextColor3` (and `text-transparent` reaches `TextTransparency`) on both paths.
The overloaded non-color halves of the prefix, `text-lg` and `text-left`, still
fall through unresolved rather than guessing a value.
