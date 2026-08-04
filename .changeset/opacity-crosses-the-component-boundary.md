---
"@vela-rbxts/compiler": minor
"@vela-rbxts/runtime": minor
---

Carry `opacity-*` across a component boundary, in both directions.

A fade written around a component reached nothing it rendered, and a fade written
on one — `<Label className="opacity-50" />` — lowered to `BackgroundTransparency`
and no further: the tag is unknown there, so the channel that actually paints a
label was never named and its text stayed opaque. The emitted Luau held the token
either way; the instance held `0`.

React context is the one thing that crosses that boundary, so the alpha now
travels as one. The transformer wraps what it cannot reach — `{props.children}`,
a component child, a component element carrying the utility itself — in a
provider that renders no instance, so the tree keeps its shape, its keys and the
names Roblox gives them. That provider is relative: it multiplies its alpha by
the fade it is nested in, because a context alone would let the inner value win
rather than compose. An `opacity-*` on a component element lowers to no property
at all now; it becomes that alpha.

Reaching a subtree that was lowered entirely at compile time needs a consumer,
since an instance cannot read a context. Every component definition gets its root
routed through one, unless that root is a runtime host or another component,
which read the context for themselves. The consumer walks the instances below it
and composes the alpha onto each channel they paint, and stops at anything that
resolves against the context on its own — fading those from outside as well would
apply the same alpha twice. The context lives on a shared global rather than
being created per module: the runtime is inlined into every file that needs it,
so a `createContext` in each copy would make one context per module and nothing
would ever cross. A file that needs only the fade inlines that namespace alone
rather than the whole runtime host.

A class value that settles at render time is now left whole to the runtime for
the same reason. The transformer no longer fades the subtree under a
`className={cn(…)}`, and the host — which resolves all of it — hands its children
one alpha, so an `opacity-*` inside a recipe reaches the subtree it is written
over. The fade still ends at a `canvasgroup` on both paths: its
`GroupTransparency` composites the subtree in one pass, and the runtime resets
the context there so nothing below repeats it.

`opacity-unreachable-child` is gone with the limitation it described. One
difference between the two paths remains: the static path leaves a transparency
the author declared on the element alone, and a fade arriving as context cannot
tell that prop from one Vela lowered, so it composes over both.
