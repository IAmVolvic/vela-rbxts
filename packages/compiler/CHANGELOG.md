# @vela-rbxts/compiler

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

### Patch Changes

- 3724fbd: Group the inlined runtime into namespaces so it stops crowding Luau's local
  register limit.

  Scoping the runtime into one initializer moved its declarations off module
  scope, but it did not shrink them: the initializer is itself a function, and it
  had grown to 177 of the 200 local registers Luau allows one. Twenty-three more
  top-level helpers — roughly one utility family's worth — and every transformed
  file would have failed to compile with
  `Out of local registers when trying to allocate <name>: exceeded limit 200`,
  against generated code the author never wrote.

  The runtime's helpers now live in thirteen namespaces. roblox-ts lowers a
  namespace to `local Group = {} do ... end`, so a group costs one register that
  lives on and its members are freed at the block's end. Growth is bounded by the
  group a helper joins rather than by the runtime as a whole.

  Measured on the rbxts harness, the busiest register file in an emitted file went
  from 177 to 65. Both the harness and the compiler crate now assert a budget of
  120, so crowding the limit again fails a test instead of a consumer's build.

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

### Patch Changes

- c661947: Scope the inlined runtime host so a file with enough parts of its own still
  compiles.

  Luau caps a function at 200 local registers, and a module body is a function.
  The runtime was inlined as ~96 top-level declarations, which every transformed
  file paid before it declared anything itself — so a component with enough parts
  crossed the limit and failed to compile at all, reporting
  `Out of local registers when trying to allocate <name>: exceeded limit 200`
  against generated code the author never wrote. A six-part `card` hit it at the
  second part; the four components beside it were merely close.

  The runtime now arrives as a single initializer, so the module body spends one
  register on it instead of ninety-six. Type declarations stay outside it: they
  cost no register, and the host cast names one of them.

  Measured on the rbxts harness, module-scope locals in an emitted file went from
  96 to 12.

  The runtime source moved out of a string literal in the Rust crate and into
  `packages/runtime/src/index.ts`, which the compiler reads at build time. It is
  not published and consumers install nothing — the point is that the runtime is
  now real TypeScript the repo typechecks and formats, which it could never do
  while it was a string. That alone caught a live brace error in it.

## 0.8.0

### Minor Changes

- 9cea6df: Resolve every utility family on the runtime class path.

  The runtime host knew about a third of the families the static path lowers, so a
  component whose `className` arrives as a value kept losing whatever the subset
  did not cover: positioning (`left-*`, `inset-*`, `translate-*`, `origin-*`,
  `mx-auto`), the box constraints (`min-w-*`, `max-h-*`, `aspect-*`), the grid
  (`grid-cols-*`, `auto-rows-*`), gradients, `ring-*`/`outline-*`, shadows,
  `z-*`, `rotate-*`, `scale-*`, `opacity-*`, `order-*`, `leading-*`, `self-*`,
  `content-*`, `object-*`, `pointer-events-*`, `space-*`, `whitespace-*`, the
  whole ScrollingFrame family and the rest of the text families.

  All of them now resolve dynamically with the static semantics: color opacity
  modifiers (`bg-blue-600/50`) and arbitrary values (`bg-[#ff0000]`, `w-[120px]`,
  `text-[13px]`) included, and the families that only meet at the end — the two
  `Size` axes, `Position` and `AnchorPoint`, `FontFace`, a grid track and the gap
  it gives back — are composed the way `PendingAxes::flush` composes them.
  `font-<family>` resolves too: `theme.fontFamily` now reaches the runtime theme.

  A utility the host element cannot carry is dropped rather than applied, mirroring
  `is_utility_allowed_on_host` — writing `TextColor3` onto a `Frame` is a hard
  Roblox error, not a no-op.

  The runtime host also names `UIShadow` by its real class: `@rbxts/react` passes a
  tag it does not know straight to `Instance.new`, which is case sensitive, so the
  lowercase form would fail to instantiate and unwind the whole tree. The static
  path still emits the lowercase tag through JSX and needs its own fix.

## 0.7.0

### Minor Changes

- e464a5a: Add plugin utilities and a motion driver seam.

  `plugins.utilities` lets a config name its own tokens, expanding either to a
  utility class list or straight to Roblox property assignments, with a depth cap
  so a self-referential definition fails the config rather than the build.

  `plugins.motion` lets a driver take over transitions or animations one method at
  a time; whatever it leaves alone stays on the built-in TweenService path.

- e464a5a: Resolve layout, sizing and text utilities on the runtime class path.

  The runtime host implemented a strict subset of the static lowering, so a
  component whose `className` comes from a helper — the normal shape for a variant
  recipe — silently lost most of its styling: `flex-row`, `items-*`, `justify-*`,
  `w-fit`/`h-auto`/`size-fit`, `text-<size>`, `text-left|center|right` and
  `font-<weight>` all fell through.

  They now resolve with the same semantics the static path uses. `font-<family>`
  remains static-only, because the runtime theme carries colors, radius and
  spacing but no font families.

## 0.6.0

### Minor Changes

- 8ff59d9: Give `grid-cols-*`/`grid-rows-*` a real `CellSize`, and add `auto-rows-*` /
  `auto-cols-*` to name the other axis.

  `UIGridLayout` stamps `CellSize` onto every child and ignores whatever `Size`
  the child set for itself. The grid utilities only ever set `FillDirection`,
  `FillDirectionMaxCells` and `CellPadding`, so every cell fell back to Roblox's
  100x100 default: a `grid-cols-2` of 430px cards collapsed to 100px squares and
  their content spilled across the neighbouring track. `grid-cols-*` was not
  merely imprecise, it was unusable.

  `grid-cols-N` now divides the axis it fills into N tracks and hands each cell
  back its share of the gap — `grid grid-cols-2 gap-2.5` lowers to
  `CellSize = new UDim2(0.5, -5, 0, 100)`. `grid-rows-N` does the same on the
  vertical axis.

  The cross axis needs its own answer, since a column count says nothing about
  row height, so `auto-rows-*` and `auto-cols-*` set it from the spacing scale.
  Without one it stays at the 100px the engine already used, which is why this is
  a minor rather than a patch: existing grids keep their row extent and gain
  correct track widths.

### Patch Changes

- 354b20b: Keep `w-*` and `h-*` from erasing each other on the runtime path. `Size` holds
  both axes, so a bundle that named one of them used to state a whole `UDim2` and
  zero out the other — `md:w-32 md:h-32` kept only the height, and a `md:h-32`
  overlay dropped the base width. Variant rules and dynamic class values now carry
  each axis on its own, and the runtime composes them over whatever `Size` the
  element already has, so a variant only moves the axis it names.
- b4e5ee1: Resolve `text-{color}` on the runtime path. A dynamic class value reaches the
  inlined runtime host, and that resolver had no `text-` branch at all, so every
  text color in one was dropped without a diagnostic — the label kept Roblox's
  near-black default and went invisible on any dark surface, while the identical
  class string lowered correctly when it happened to be static. Colors now reach
  `TextColor3` (and `text-transparent` reaches `TextTransparency`) on both paths.
  The overloaded non-color halves of the prefix, `text-lg` and `text-left`, still
  fall through unresolved rather than guessing a value.

## 0.5.2

### Patch Changes

- fe23df6: Keep `w-*` and `h-*` from erasing each other on the runtime path. `Size` holds
  both axes, so a bundle that named one of them used to state a whole `UDim2` and
  zero out the other — `md:w-32 md:h-32` kept only the height, and a `md:h-32`
  overlay dropped the base width. Variant rules and dynamic class values now carry
  each axis on its own, and the runtime composes them over whatever `Size` the
  element already has, so a variant only moves the axis it names.

## 0.5.1

## 0.5.0

### Minor Changes

- c84f22b: Neutralize the Roblox host defaults, and add a `preflight` config flag to turn
  that off. Roblox paints every `GuiObject` as an opaque gray box with a 1px
  border, and a framework that only ever adds properties can never take that
  back — so `bg-transparent` had to be repeated on almost every element. Any host
  element carrying a `className` now starts from `BackgroundTransparency = 1` and
  `BorderSizePixel = 0` unless a `bg-*` utility or an explicitly declared prop
  says otherwise, and a background painted by a variant or a dynamic class value
  reopens it. Elements without a `className`, and components, are untouched.

  **Breaking for existing UI:** anywhere the default gray background was
  load-bearing, the element now renders invisible. Add the `bg-*` it was relying
  on, or set `preflight: false` in `vela.config.ts` to keep the old behavior.

### Patch Changes

- 7a4dfa4: Fix `order-*` being ignored inside a flex container. The lowered `UIListLayout`
  left `SortOrder` at its engine default of `Name`, so children sorted
  alphabetically by instance name — `order-1` on a `textlabel` still landed after
  `order-2` on a `textbutton` — while `UIGridLayout` already set
  `SortOrder = LayoutOrder`. Every `UIListLayout` the compiler emits now sets it,
  statically and through the runtime host, unless something else already did.
- 6e20817: Stop emitting the deprecated `table.getn` from the inlined runtime host. The
  array-length helper aliased it locally because an earlier `.length` spelling
  compiled straight through as a nil field, but Luau's script analysis flags
  every `table.getn` reference as deprecated in consumer places. The helper now
  uses `size()`, which roblox-ts lowers to the `#` operator.

## 0.4.2

### Patch Changes

- fd6d430: Type a `ref` on a runtime-hosted element from its host tag. The runtime host is
  built with `forwardRef`, which pins one ref type for the whole component, so any
  element a variant or motion utility promoted typed its `ref` as `Ref<unknown>` —
  `<frame ref={frameRef} className={dynamic} />` would accept a ref to anything.
  The host is now restated as a generic call whose ref follows `__velaTag`.
- 80900eb: Fix `transition` snapping instead of tweening whenever the base value came
  from a statically lowered utility. The runtime host seeded its held tween
  values from the resolution alone, which never carries a static base like
  `bg-slate-700`, so the first render a `hover:`/`md:` rule introduced the prop
  held the _new_ value and the tween had nowhere to travel from. It now seeds
  from the merged props, and both entering and leaving a variant tween.
- 0348ad8: Fix a variant colour leaving the base opacity modifier in place, so
  `bg-blue-600/50 hover:bg-blue-600` stayed half transparent on hover instead of
  turning opaque. A variant resolves in isolation and then overlays the base at
  runtime, so dropping the transparency prop from its own bundle never reached
  the base value — the variant now states the opaque value when anything else in
  the same class list set that family's transparency.

## 0.4.1

### Patch Changes

- 04c4e35: Diagnostic quality: malformed `configJson` now reports `invalid-config-json` instead of silently falling back to the default theme, TSX parse failures carry line/column and a source range instead of a debug dump, and an invalid `vela.config.*` export names the failing theme key. The compiler root tarball also stops bundling the publish machine's native binary — platform packages already provide them.
- b5714bc: Fix two runtime host defects: breakpoint and orientation variants never matched because `Camera.ViewportSize` was only read at mount while it still reports 1x1, and `divide-*` counted lowered helper elements as content, placing a separator above the first child.
