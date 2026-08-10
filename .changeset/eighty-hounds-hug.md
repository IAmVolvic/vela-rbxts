---
"@vela-rbxts/compiler": patch
"@rbxts/vela-runtime-vide": patch
---

Tell the Vide host a margin is coming.

A margin box is an instance *above* the element, and Vide parents an element as
soon as it builds one — so a `m-*` the runtime resolved could never be honoured.
No rule can carry a margin either, which is exactly why such a class value goes
to the runtime whole.

But the compiler read the token on its way to that decision. It says so now:
a class value naming a margin anywhere this pass can see — a static token, a
branch's — emits `__velaMarginBox`, and the host builds the box before the
element rather than after. `EmitTarget::needs_margin_box_hint` is what asks, and
React answers `false`: the render that resolves a margin also renders the
wrapper around it, so the hint would only be a prop with no reader.

What is left is a margin named where nothing can read it — a token arriving out
of an opaque call — and the runtime warns there rather than rendering unspaced.
