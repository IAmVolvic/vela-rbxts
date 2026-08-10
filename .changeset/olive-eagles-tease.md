---
"@rbxts/vela-runtime-vide": patch
---

Close the three opacity holes the Vide host had left.

They share one seam. React has a single context that both the host and the fade
consumer read; Vide has two disjoint mechanisms — the host's own
`__velaOpacity`, and a consumer that walks the instances a component already
built — and the mark that keeps the two from overlapping dropped exactly these
cases.

The context's alpha never reached a prop the element was *handed*, only what it
resolved, so a written `BackgroundTransparency={0}` under a component-boundary
fade stayed opaque. A component the host renders got no alpha at all, because
every one the host applies sat behind a host-tag guard — its body runs inside
the host, though, which is the one place a real Vide context scope still opens
around a subtree the transformer could not see into. And a host's own children
got nothing from an `opacity-*` the host resolved: React wraps them in a
provider they read during their own render, which a child built before its
parent cannot do, so the alpha is written onto what they built instead —
against a remembered base, so a resolution that changes it does not compound.

All three were measured in Studio against what the React host computes for the
same element, and now agree with it.
