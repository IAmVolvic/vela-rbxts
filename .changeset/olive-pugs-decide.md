---
"@rbxts/vela-runtime": minor
"@vela-rbxts/compiler": minor
"vela-rbxts": minor
---

Resolve a class value's known branches at compile time.

`active ? "text-lg" : "text-sm"` names every token it can ever apply — only which
of them apply is undecided — but the whole class value used to travel to the
runtime resolver, which parses a subset of the utility set. `text-lg` is not in
that subset, so neither size ever reached the instance.

Those branches are now resolved by the compiler, through the same call the static
path makes, and the element is handed the resolved props alongside the tests that
decide them. It still renders through the runtime host, because something has to
read the tests, but nothing is parsed in-game:

- the full utility set applies inside a branch, not the runtime resolver's prefixes
- a bad utility written in a branch now reports a diagnostic instead of vanishing
- a variant inside a branch answers to both, as `hover:` **and** the branch's test
- each test is evaluated exactly once, however many branches hang on it

It reads ternaries, `&&`, the literal behind `||`, arrays, and object maps, and it
resolves a branch among the tokens written around it — so `["w-40", tall && "h-10"]`
is one `Size` rather than a branch that overwrites the width.

A branch naming `m-*`, `divide-*`, `animate-*`, `transition*`, a text transform or
`opacity-*` still takes the whole class value down the runtime path unchanged:
the runtime host reads those off its own props rather than off the resolution.

Two fixes that predate branches came with it, both on the rule path:

- A base helper a variant rule overwrote (`p-4 hover:p-8`) was emitted as a child
  *and* resolved by the host, leaving two `UIPadding` under one instance. The base
  helper now joins the resolution, where the two merge by tag.
- A rule carries its prop values as source text and the runtime parses them back,
  but the parser did not know `Vector2`, `ColorSequence` or `Font` — so
  `md:min-w-16`, `md:bg-gradient-to-r` and `md:font-bold` assigned a string to a
  Roblox property, which React rejects by tearing down the whole tree. It now
  parses every constructor the emit can write.
