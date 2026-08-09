---
"@vela-rbxts/compiler": patch
---

Hand a branched `opacity-*` back to the runtime host.

A bare `opacity-*` fades the element's subtree as well as the element, and
the subtree wrapper is built from the tokens that always apply — a branch is
not among them. Lowered as a rule the branch painted the element's own
transparency and the subtree never learned about the alpha.

A class value with a branch naming an opacity now goes back to the runtime
host, which resolves it and hands the subtree one alpha. A CanvasGroup stays
on the rule path — `GroupTransparency` composites its subtree by itself — and
an opacity written beside a branch stays as static as it ever was.
