# @vela-rbxts/runtime

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
