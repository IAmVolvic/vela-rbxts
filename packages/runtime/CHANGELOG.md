# @vela-rbxts/runtime

## 0.10.0

### Minor Changes

- 63d44ca: Carry `opacity-*` across a component boundary, in both directions.

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

## 0.9.0

### Minor Changes

- c661947: Compose `opacity-*` into everything the element draws, and into the subtree
  written under it.

  `opacity-*` lowered to `BackgroundTransparency` alone, which is invisible on a
  label whose background is already transparent, and it reached nothing below the
  instance it was written on. It now fades every channel the host paints itself —
  `BackgroundTransparency` everywhere, `TextTransparency` on the text hosts,
  `ImageTransparency` on the image hosts, and the `Transparency` of a `UIStroke` or
  `UIShadow` drawn alongside it. A `canvasgroup` still takes `GroupTransparency`
  alone, which already covers all of them.

  Roblox has no inherited transparency: CSS fades a subtree by compositing it once
  and multiplying alpha over the result, and the closest thing that stays a
  property is to hand every instance below the class the running product. The
  transformer now walks the JSX with that alpha and applies `1 - (1 - own) * alpha`
  to each element it reaches, which includes children written inside an expression
  — `{cond && <X />}` and `{items.map(…)}` are nested JSX as far as the AST is
  concerned. A `canvasgroup` on the way down ends the walk. A child whose
  `className` is only known at render time is handed the alpha as `__velaOpacity`
  so the runtime host composes what it resolves, variant rules included; the
  statically known half is composed at compile time and neither side does it twice.

  Two shapes stay out of reach — `{props.children}`, and a component child whose
  instances are created elsewhere — and both now report
  `opacity-unreachable-child` rather than silently fading half a subtree.

  `opacity-*` also stopped being order-dependent. `bg-slate-700` clears
  `BackgroundTransparency`, so `opacity-50 bg-slate-700` came out opaque while
  `bg-slate-700 opacity-50` did not. Tailwind reads `opacity-*` as independent of a
  color's own alpha and multiplies the two, so the utility is now held until the
  whole class list is read and composed over whatever alpha the colors settled on.

  Overlapping siblings are where this parts ways with a real composite: it fades
  each of them rather than the group, so the overlap darkens.
