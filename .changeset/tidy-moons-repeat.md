---
"@vela-rbxts/compiler": patch
"@rbxts/vela-runtime-core": patch
---

Read a class the way it is written rather than the way whitespace splits it.

Two shapes were reported as broken while being perfectly ordinary. A template
interpolation splices into the class beside it, so `` `w-[${width}]` `` reaches
the editor as `w-[` and `]`, and both were analyzed as if they were whole
classes: one unknown theme key and one unsupported family for a class the
compiler defers to the runtime untouched. A token an interpolation cuts into is
left alone now; a token that merely sits next to one, with a space between, is
checked as before.

The second shape was not editor-only. Whitespace inside an arbitrary value split
it into pieces, so `w-[calc(100% - 4px)]` was read as `w-[calc(100%`, `-` and
`4px)]`, and both the editor and the compiler reported three diagnostics about
fragments instead of one about the value. Whitespace stops separating classes
between a `[` and the `]` that closes it. A bracket that never closes still
splits, so the classes written behind a typo go on applying, and sorting moves
such a value as the one class it is rather than refusing to touch the value it
sits in.

The runtime splits class strings in Luau rather than in the compiler, so it
carries the same rule: a static class and a deferred one tokenize alike.
