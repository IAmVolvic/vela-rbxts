---
"@vela-rbxts/compiler": patch
---

Drop the theme scales from a file the runtime never parses a class against.

The inlined runtime host carried the whole resolved config — every color scale,
every radius, spacing and font-family key, and the plugin utility table. That is
about 19KB of the emit, and the host only ever reads it while parsing a class
value it was handed at render time.

Most files hand it none. A variant, a branch, a text transform, a margin, a
divide or a preset animation reaches the host through props the compiler already
resolved, and the tables sit there unread. Those files now inline the config with
its scales emptied, which is roughly 400 bytes instead of 19KB.

A file that does hand the host a class value — a `className` bound to a value the
compiler cannot read — keeps the full tables, and so does one whose host takes a
spread, since a spread can carry a `className` this pass never sees. `preflight`,
`theme.rem` and the motion driver stay either way; the host reads those whatever
it renders.

Nothing about what a class resolves to changes.
