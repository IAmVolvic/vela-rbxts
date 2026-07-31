---
"@vela-rbxts/compiler": patch
---

Fix `transition` snapping instead of tweening whenever the base value came
from a statically lowered utility. The runtime host seeded its held tween
values from the resolution alone, which never carries a static base like
`bg-slate-700`, so the first render a `hover:`/`md:` rule introduced the prop
held the *new* value and the tween had nowhere to travel from. It now seeds
from the merged props, and both entering and leaving a variant tween.
