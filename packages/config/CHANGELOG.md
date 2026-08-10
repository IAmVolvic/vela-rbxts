# @vela-rbxts/config

## 0.12.2

### Patch Changes

- @vela-rbxts/types@0.12.2

## 0.12.1

### Patch Changes

- @vela-rbxts/types@0.12.1

## 0.12.0

### Minor Changes

- 7a9fde7: Add `theme.rem`, so every pixel offset a utility lowers follows the viewport.

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

### Patch Changes

- @vela-rbxts/types@0.12.0

## 0.11.1

### Patch Changes

- @vela-rbxts/types@0.11.1

## 0.11.0

### Patch Changes

- @vela-rbxts/types@0.11.0

## 0.10.0

### Patch Changes

- @vela-rbxts/types@0.10.0

## 0.9.0

### Patch Changes

- @vela-rbxts/types@0.9.0

## 0.8.0

### Patch Changes

- @vela-rbxts/types@0.8.0

## 0.7.0

### Minor Changes

- e464a5a: Add plugin utilities and a motion driver seam.

  `plugins.utilities` lets a config name its own tokens, expanding either to a
  utility class list or straight to Roblox property assignments, with a depth cap
  so a self-referential definition fails the config rather than the build.

  `plugins.motion` lets a driver take over transitions or animations one method at
  a time; whatever it leaves alone stays on the built-in TweenService path.

### Patch Changes

- @vela-rbxts/types@0.7.0

## 0.6.0

### Patch Changes

- @vela-rbxts/types@0.6.0

## 0.5.2

### Patch Changes

- @vela-rbxts/types@0.5.2

## 0.5.1

### Patch Changes

- @vela-rbxts/types@0.5.1

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

- @vela-rbxts/types@0.5.0

## 0.4.2

### Patch Changes

- @vela-rbxts/types@0.4.2

## 0.4.1

### Patch Changes

- @vela-rbxts/types@0.4.1
