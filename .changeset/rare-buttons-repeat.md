---
"@rbxts/vela-runtime": minor
"@vela-rbxts/compiler": minor
"@vela-rbxts/config": minor
"vela-rbxts": minor
---

Add `theme.rem`, so every pixel offset a utility lowers follows the viewport.

`p-4`, `w-40`, `rounded-lg`, `text-sm`, `border-2` and `top-2` are now rem units
rather than raw pixels: one rem is 16px at a 1920×1020 viewport and scales from
there, so the same class list reads at the same visual weight on a phone, a
laptop and a 4K monitor. The curve follows Littensy's rem provider — the viewport
diagonal against `baseResolution`, capped at a 19:9 aspect ratio, with a gentler
falloff in portrait — rounded and clamped into `[min, max]`. No provider, hook or
wrapper component is involved.

`base`, `min`, `max` and `baseResolution` are configurable, and `rem` merges
field by field rather than replacing the family, so naming only `min` leaves the
rest at their defaults.

This changes rendering on any viewport other than the base resolution. To keep
the previous literal-pixel behavior, close the clamp:

```ts
export default defineConfig({
  theme: { rem: { min: 16, max: 16 } },
});
```

With the clamp closed on `base` the compiler drops the scaling from the emit
entirely — offsets lower to plain `UDim2`/`UDim` literals with no binding and no
runtime import. Pinning somewhere other than `base` is still a scale, by a
constant ratio, so it keeps the binding. An inverted clamp collapses onto `min`.

Scale-valued utilities are untouched: `w-full`, `h-1/2` and `translate-x-1/2`
stay fractions of the parent.

`TextSize` stops at 100, which is where Roblox itself stops honoring it. On a
large viewport `text-6xl` and up land on that ceiling rather than tweening
toward a size the engine never paints.
