---
"@vela-rbxts/compiler": patch
---

Read every shape a class value is written in.

`className={() => "..."}` reached the editor features only while the file was
failing to parse, where the lexical fallback happened to find the string. The
walker that reads a `className` expression had no arm for a function, so a
deferred class value, which is how a Vide project writes one, went unread on
every file that did parse.

It follows what a function returns now, along with the shapes that were missing
beside it: a template's interpolations, `as const` and `satisfies`, string
concatenation, and an object's computed keys and spreads.

Two things the same walk got wrong go with it. The lexical fallback read a
template's `${...}` as class text, so a half-typed file reported `${flag` and
`?` as unknown utilities. And sorting dropped the space either side of an
interpolation, running the last token into whatever it resolves to.
