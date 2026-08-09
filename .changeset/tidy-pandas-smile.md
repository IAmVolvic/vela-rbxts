---
"@rbxts/vela-runtime": minor
"@vela-rbxts/compiler": minor
"vela-rbxts": minor
---

Send the theme as what a project changed, not as the whole palette.

A module that hands the runtime host a class value to parse — `className={cn(…)}`,
a spread that might carry one, a plugin utility resolved at render time — used to
carry the entire theme so the parser could read it. Most of that is the default
Tailwind palette, which is the same table in every such module in every project.
In the reference app it was 15,950 bytes of a 43,187-byte `App.luau`: 37% of the
file, and the runtime re-parsed all of it into `Color3` values once per module.

`@rbxts/vela-runtime` now carries the defaults itself, copied at build time from
the same `packages/config/src/defaults.json` the compiler diffs against, and the
emit sends only the entries that differ:

```lua
theme = { colors = {}, radius = {}, spacing = {}, fontFamily = {}, rem = { … } }
```

That `App.luau` is now 27,912 bytes, and the emitted config within it went from
15,950 to 675.

What travels scales with what you changed, not with the size of the palette:

- an untouched scale sends nothing at all
- `theme.extend.colors.brand` sends `brand`
- overriding one shade sends that whole color family, so the shades around it
  survive the family-level merge
- a top-level `theme.colors`, which **replaces** the scale rather than extending
  it, sends the table whole and names it in `theme.replaced` — otherwise the
  runtime would merge the defaults back under it and resurrect colors the
  project deliberately dropped

A module that parses no class value still sends empty tables, now marked
replaced so the runtime uses them as given instead of falling back on its
defaults — the same behaviour as before, and it keeps that module from
normalizing a palette it never reads.
