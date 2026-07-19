# vela-rbxts

`vela-rbxts` is a Tailwind-style `className` integration layer for [roblox-ts](https://roblox-ts.com/).
This monorepo contains the native compiler, the `rbxtsc` host adapter, shared config and type packages, the inline runtime helper used by the transformer, a standalone Rust LSP adapter, and two harness apps.

Release workflow documentation is available in `docs/release.md`.

## Current Scope

The implementation is intentionally narrow and focuses on Roblox UI styling rather than full Tailwind parity.

- `className?: ClassValue` is added to `React.Attributes` through `vela-rbxts`.
- Supported TSX files are lowered by the `rbxtsc` transformer when they target supported Roblox host elements or your own components.
- Dynamic `ClassValue` expressions and supported Roblox-oriented variants are rewritten with an inline runtime helper when needed.
- The standalone Rust LSP server under `packages/lsp` provides completions, hover, document colors, quickfixes, and diagnostics in editors.
- Unsupported utility families and unknown theme keys produce diagnostics instead of being silently ignored.

Full documentation lives at [docs.astra-void.xyz/vela-rbxts](https://docs.astra-void.xyz/vela-rbxts/). This README is the short version.

## Packages And Apps

| Path | What it does |
| --- | --- |
| `packages/vela-rbxts` | The only package an app installs. Re-exports config helpers, `createTransformer`, shared types, and the `./transformer` subpath export. |
| `packages/compiler` | Native compiler implementation that resolves, validates, and lowers utility classes. |
| `packages/lsp` | Standalone Rust stdio LSP server that adapts the compiler's editor APIs for completions, hover, colors, quickfixes, and diagnostics. |
| `packages/vscode-extension` | VS Code client for the LSP, published to the marketplace as `astra-void.vela-rbxts-lsp`. |
| `packages/rbxtsc-host` | Host adapter that filters eligible files, loads project config, and bridges compiler diagnostics into `rbxtsc`. |
| `packages/config` | Config schema, defaults, and `defineConfig()` helper. |
| `packages/core` | Semantic boundary and supported host element contracts. |
| `packages/ir` | Internal shared IR and supporting types. |
| `packages/types` | Shared public utility types such as `ClassValue` and `StylableProps`. |
| `apps/rbxts-harness` | Local reference app used by maintainers to validate the transformer in a real roblox-ts project. |
| `apps/compiler-harness` | Browser-based preview for the compiler API and diagnostics. |

## Using vela-rbxts in a roblox-ts project

`apps/rbxts-harness` in this repository is only a local reference app for maintainers. You do not need to recreate it to use Vela in your own project.

### 1. Install the packages

Install Vela alongside the normal roblox-ts React dependencies:

```bash
pnpm add vela-rbxts @rbxts/react @rbxts/react-roblox @rbxts/services
pnpm add -D @rbxts/compiler-types @rbxts/types roblox-ts typescript
```

If you are starting from an existing roblox-ts project, keep your current workspace tooling and add only the missing packages.

### 2. Configure `tsconfig.json`

Add the transformer entry to `compilerOptions.plugins`:

```json
{
  "compilerOptions": {
    "allowSyntheticDefaultImports": true,
    "jsx": "react",
    "jsxFactory": "React.createElement",
    "jsxFragmentFactory": "React.Fragment",
    "module": "commonjs",
    "moduleDetection": "force",
    "moduleResolution": "Node",
    "noLib": true,
    "strict": true,
    "target": "ESNext",
    "typeRoots": ["node_modules/@rbxts", "node_modules/@vela-rbxts"],
    "types": ["types", "compiler-types"],
    "plugins": [
      {
        "transform": "vela-rbxts/transformer"
      }
    ],
    "rootDir": "src",
    "outDir": "out",
    "baseUrl": "src",
    "incremental": true,
    "tsBuildInfoFile": "out/tsconfig.tsbuildinfo"
  },
  "include": ["src"]
}
```

The transformer is what lowers supported `className` usage into Roblox props during the roblox-ts build.

`moduleDetection` and `allowSyntheticDefaultImports` are enforced by roblox-ts; it refuses to build without them. `incremental` is required whenever `tsBuildInfoFile` is set, or TypeScript fails with TS5069.

If you also depend on packages outside the `@rbxts` scope, roblox-ts requires every scope you import from to be listed in `typeRoots`. Add them alongside the entries above, for example `"node_modules/@your-scope"`.

### 3. Add `vela.config.ts`

Vela reads its project configuration from `vela.config.ts`. Use `defineConfig()` from `vela-rbxts`:

```ts
// vela.config.ts
import { defineConfig } from "vela-rbxts";

export default defineConfig({
  theme: {
    extend: {
      colors: {
        surface: "Color3.fromRGB(40, 48, 66)",
        brand: {
          500: "Color3.fromRGB(59, 130, 246)",
          700: "Color3.fromRGB(29, 78, 216)",
        },
      },
    },
  },
});
```

Theme values are expression strings, not colors or numbers. They are spliced into the TSX before roblox-ts compiles it, so they are written in the roblox-ts dialect — `new UDim(0, 6)` and `Color3.fromRGB(59, 130, 246)`, not their Luau equivalents.

Put additions under `theme.extend`. A top-level `theme.colors` **replaces** the whole color scale, and when it is present `theme.extend.colors` is discarded rather than merged on top of it — unlike real Tailwind. The same replace-versus-merge rule applies to `radius` and `spacing`.

If you do not need custom theme values, `export default defineConfig();` is enough.

### 4. Add the declaration file

Add a declaration file such as `src/vela-rbxts.d.ts` so `className` is available on React attributes:

```ts
// src/vela-rbxts.d.ts
import "vela-rbxts";
```

### 5. Serve the project

Use your normal Rojo project setup and serve the compiled roblox-ts output as usual.
Vela does not require an extra runtime package, generated folder, or Vela-specific Rojo mapping.

For example, a client output mapping can remain as simple as:

```json
{
  "StarterPlayer": {
    "$className": "StarterPlayer",
    "StarterPlayerScripts": {
      "$className": "StarterPlayerScripts",
      "Client": {
        "$path": "out/client"
      }
    }
  }
}
```

The transformer inlines its runtime helper into transformed modules only when runtime evaluation is needed.

### 6. Use `className` in TSX

A minimal component looks like this:

```tsx
import React from "@rbxts/react";

export function App() {
  return <frame className="rounded-md bg-slate-700 px-4 py-3" />;
}
```

The transformer handles supported host elements such as `frame`, `textlabel`, `textbutton`, and the other Roblox UI elements listed below.

### 7. Build and run

Use the normal roblox-ts build and watcher commands, then serve the Rojo project into Studio:

```bash
pnpm install
pnpm exec rbxtsc -p tsconfig.json
pnpm exec rbxtsc -w -p tsconfig.json
rojo serve default.project.json
```

In a typical project, `rbxtsc -p tsconfig.json` is your build step, `rbxtsc -w -p tsconfig.json` is your local watch mode, and `rojo serve` keeps Studio synced with the compiled output and mapped module folders.

## Supported Surface

### Theme Axes

The current config model supports these theme families:

- `colors`
- `radius`
- `spacing`

`spacing` feeds padding, gap, and sizing utilities in the current compiler slice.

Merge behavior:

- `theme.extend.*` merges into the built-in defaults
- top-level `theme.*` replaces the final scale for that family
- when a top-level `theme.colors` is present, `theme.extend.colors` is discarded rather than layered on top — real Tailwind merges the two, this does not

Built-in colors ship 26 shade palettes plus the literals `black` and `white`. Twenty-two borrow their names from Tailwind (`slate`, `gray`, `zinc`, `neutral`, `stone`, `red`, `orange`, `amber`, `yellow`, `lime`, `green`, `emerald`, `teal`, `cyan`, `sky`, `blue`, `indigo`, `violet`, `purple`, `fuchsia`, `pink`, `rose`) and four are our own (`mauve`, `olive`, `mist`, `taupe`). The names match Tailwind; the values are close but not identical. Every palette carries the shades `50`, `100` through `900` in hundreds, and `950`.

A palette needs a shade, so `bg-slate-700` resolves and bare `bg-slate` reports `color-missing-shade`. A singleton semantic color such as `bg-surface` resolves only after you define `surface`.

`radius` ships `none`, `xs`, `sm`, `md`, `lg`, `xl`, `2xl`, `3xl`, `4xl`, and `full`.

`spacing` ships exactly one key, `4`. Every other spacing token resolves through a numeric fallback: a non-negative multiple of `0.5` becomes an offset of `key * 4` pixels, so `p-1.5` is 6px and `p-40` is 160px. Define `theme.extend.spacing` when you want named keys instead.

### Supported Host Elements

The semantic boundary currently recognizes these Roblox elements:

- `frame`
- `scrollingframe`
- `canvasgroup`
- `textlabel`
- `textbutton`
- `textbox`
- `imagelabel`
- `imagebutton`

`className` on any other lowercase element — `screengui`, `uilistlayout`, and the rest — is left alone and reported as `classname-on-unsupported-host`.

### Components

`className` also works on your own React components. Anything whose name starts with an uppercase letter, or any dotted name such as `Switch.Root`, counts as a component:

```tsx
<Card className="bg-slate-700 rounded-md px-4" />
```

The transformer resolves the utilities at compile time and passes the result to the component as ordinary props, with helper elements added as its first children:

```tsx
<Card BackgroundColor3={Color3.fromRGB(49, 65, 88)}>
  <uicorner CornerRadius={new UDim(0, 6)} />
  <uipadding PaddingLeft={new UDim(0, 16)} PaddingRight={new UDim(0, 16)} />
</Card>
```

This means the component has to forward the props and children it does not consume down to a Roblox host element, the same way `className` on the web only works because a component passes it to a DOM node. Components that drop unknown props will silently drop the styling.

Dynamic `ClassValue` expressions and runtime-aware variants work on components too. Those are wrapped in the inline runtime helper, which resolves the class list at runtime and then renders the component with the resulting props.

Per-element utility restrictions do not apply to components, because the eventual host element is unknown. The editor offers the full utility set inside a component's `className` and never reports `unsupported-host-utility` there.

### Runtime-Aware Variants

Supported variants:

- `sm:`, `md:`, and `lg:` as min-width buckets at 640, 768, and 1024 pixels
- `portrait:` and `landscape:`
- `touch:`, `mouse:`, and `gamepad:`

Prefixes chain, and every condition has to match. Orientation is derived from the viewport as `width >= height ? landscape : portrait`. Input mode resolves gamepad first, then touch, then mouse.

A variant on a utility that actually resolves forces the runtime path for that element, including inside a plain string literal — `className="sm:w-full"` inlines the whole runtime helper into the module. (A variant on an unsupported utility resolves to nothing and stays static, which is not a feature to rely on.) Use variants where they earn it rather than by reflex.

### Supported Utility Classes

The compiler supports a narrow Tailwind-inspired slice that maps onto Roblox UI props and helper instances. A helper instance is a child — `UIPadding`, `UIListLayout`, `UICorner` and friends — that the transformer prepends to the element's children.

The exhaustive table of accepted values lives in the [utility reference](https://docs.astra-void.xyz/vela-rbxts/reference/utilities/). The summary:

| Category | Classes | Target |
| --- | --- | --- |
| Color | `bg-*`, `text-*`, `image-*`, `placeholder-*` | `BackgroundColor3`, `TextColor3`, `ImageColor3`, `PlaceholderColor3`. `transparent` sets the matching transparency prop and drops the color, where the target has one — `placeholder-transparent` has none and warns. |
| Gradient | `bg-gradient-to-*` (alias `bg-linear-to-*`), `from-*`, `via-*`, `to-*` | `UIGradient`. Any stop also forces `BackgroundColor3` to white, overriding an accompanying `bg-*` regardless of token order. |
| Border | `border`, `border-{0,1,2,4}`, `border-{color}`, `border-{round,bevel,miter}` | `UIStroke` thickness, color, and `LineJoinMode` |
| Radius | `rounded-*` | `UICorner.CornerRadius`, resolved from the theme |
| Shadow | `shadow`, `shadow-{sm,md,lg,xl,2xl}`, `shadow-none`, `shadow-{color}` | `UIShadow` |
| Stacking | `z-{0,10,20,30,40,50}` | `ZIndex` |
| Padding | `p-*`, `px-*`, `py-*`, `pt-*`, `pr-*`, `pb-*`, `pl-*` | `UIPadding` |
| Gap | `gap-*` | `UIListLayout.Padding` |
| Size | `w-*`, `h-*`, `size-*` | `Size`. `px` is a one-pixel offset, `full` is scale `1`, `fit` and `auto` set `AutomaticSize`, and a fixed set of fractions maps to scale. |
| Constraints | `min-w-*`, `max-w-*`, `min-h-*`, `max-h-*` | `UISizeConstraint` |
| Position | `left-*`, `top-*`, `inset-*` and their negated forms | `Position` |
| Anchor | `origin-*` | `AnchorPoint`, nine origins |
| Flex layout | `flex`, `flex-row`, `flex-col`, `flex-wrap`, `flex-nowrap`, `justify-*`, `items-*` | `UIListLayout`. `justify-{start,center,end}` sets `HorizontalAlignment` while `justify-{between,around,evenly}` sets `HorizontalFlex`; `items-stretch` sets `VerticalFlex`. |
| Flex items | `flex-1`, `flex-auto`, `flex-initial`, `flex-none`, `grow`, `grow-0`, `shrink`, `shrink-0` | `UIFlexItem.FlexMode` |
| Aspect ratio | `aspect-square`, `aspect-video`, `aspect-[W/H]`, `aspect-[N]` | `UIAspectRatioConstraint` |
| Transform | `rotate-*`, `-rotate-*`, `scale-*` | `Rotation`, `UIScale` |
| Effects | `opacity-*` | `BackgroundTransparency`, integers 0 to 100 |
| Typography | `text-{xs..9xl}`, `font-*`, `text-{left,center,right}`, `align-*`, `text-wrap`, `text-nowrap`, `truncate` | `TextSize`, `FontFace`, `TextXAlignment`, `TextYAlignment`, `TextWrapped`, `TextTruncate`. The font family is fixed to Source Sans Pro; only the weight is selectable. |
| Visibility | `hidden`, `visible`, `overflow-{hidden,clip,visible}` | `Visible`, `ClipsDescendants` |

### Not Implemented

These Tailwind families are not implemented and emit `unsupported-utility-family` instead of being lowered:

`m-*` and every margin variant, `absolute`, `relative`, `right-*`, `bottom-*`, `grid-*`, `content-*`, `self-*`, `place-*`, `ring-*`, `blur-*`, `leading-*`, `tracking-*`, `uppercase`, `lowercase`, `capitalize`, `transition-*`, `duration-*`, `ease-*`, `animate-*`, `transform`, `translate-*`, `skew-*`.

There is no `right-*` or `bottom-*` counterpart to `left-*` and `top-*`.

`gap-x-*` and `gap-y-*` do not exist either, but they fail differently: they match the `gap-` prefix and then fail to resolve `x-4` as a spacing key, so they report `unknown-theme-key` rather than an unknown family.

### Static And Runtime Lowering

The two paths produce very different results, and the difference is worth knowing before you compute a class string.

A `className` that collapses to static tokens is lowered at compile time, and the full utility set above applies. A `className` the compiler cannot collapse takes the runtime path, where the element is swapped for the inlined runtime helper and the class list is resolved in-game.

**The runtime resolver handles only these prefixes:** `border`, `border-*`, `bg-*`, `rounded-*`, `p-*`, `px-*`, `py-*`, `pt-*`, `pr-*`, `pb-*`, `pl-*`, `gap-*`, `w-*`, `h-*`, `size-*`. Anything else in a dynamic `className` is dropped with no diagnostic. The runtime path also accepts arbitrary bracket values the static path rejects (`p-[10]`, `w-[240]`), drops `fit` and `auto`, and lets a later `w-`/`h-` overwrite an earlier one instead of merging both into one `Size`.

Where it matters, branch between two fully static string literals so both branches stay on the static path.

### Diagnostics

- unsupported utility families and unknown theme keys emit warnings and are not lowered
- unsupported `className` patterns emit diagnostics instead of being silently dropped
- `className` on an element that is neither a supported host nor a component emits `classname-on-unsupported-host` and is left in the output
- diagnostics reach `rbxtsc` through `context.addDiagnostic`; a host that does not expose it drops them

`text-*` utilities are meaningful only on `textlabel`, `textbutton`, and `textbox`, `image-*` only on `imagelabel` and `imagebutton`, and `placeholder-*` only on `textbox`. That restriction is enforced by the editor, which reports `unsupported-host-utility`, and **not** by the compiler — `<frame className="text-red-500" />` compiles and emits `TextColor3` on a Frame with no build warning. It does not apply to components at all, since the eventual host element is unknown.

`className` support is for TSX in the roblox-ts toolchain, not plain Lua.

## Configuration

The project config file is named `vela.config.ts` — that exact filename, with no `.js`, `.mjs`, or `.cjs` variant. The host resolves it by walking upward from each source file and loading the nearest one it finds, falling back to the built-in defaults when there is none. See [step 3](#3-add-velaconfigts) for the shape and [Theme Axes](#theme-axes) for the merge rules.

The schema is only `theme.colors`, `theme.radius`, `theme.spacing`, and their `theme.extend` counterparts. There is no `content`, `plugins`, `presets`, `darkMode`, `prefix`, `safelist`, or `variants` option.

The config is transpiled and executed rather than type-checked, so a type error in it passes silently while a syntax error fails the build. Project `paths` and ambient types are not available inside it. It is also re-read and re-executed for every eligible source file, so keep it cheap.

Transformer options can be passed through the `tsconfig.json` plugin entry: `filter.skipNodeModules`, `filter.requireClassName`, `filter.requireJsxSyntax`, `diagnosticCodeBase` (default `89000`), `projectRoot`, and `config`.

Only `.tsx` files are eligible, and declaration files are always skipped. By default a file also has to sit outside `node_modules` and contain both the text `className` and JSX — those three checks are the `filter.*` options above, and each can be turned off. There is no include/exclude glob support.

## Editor Integration

Install **Vela LSP** (`astra-void.vela-rbxts-lsp`) for VS Code, or point any other editor at `npx --package @vela-rbxts/lsp vela-rbxts-lsp` over stdio. The server does not read `vela.config.ts` itself — the client supplies it through `initializationOptions.configs`, which is what the VS Code extension does as it watches `**/vela.config.ts`.

The standalone Rust LSP lives in `packages/lsp`. It reuses the native compiler as the semantic engine and only handles transport, document state, and protocol translation, so what the editor tells you about a class is what the compiler would do with it.

It provides completions inside a `className` (and nowhere else), hover, push diagnostics, document colors and color presentations, quickfix code actions, and document highlight. It does not provide go-to-definition, references, rename, formatting, semantic tokens, inlay hints, or signature help.

Prebuilt binaries cover darwin arm64 and x64, linux x64 gnu and musl, linux arm64 gnu, and win32 x64. Linux arm64 musl and Windows on ARM have no binary on any channel and need a build from source.

When developing from this monorepo, build the compiler native binding first:

```bash
pnpm --filter @vela-rbxts/compiler build
```

To run the early Rust LSP server directly:

```bash
cd packages/lsp
cargo run
```

## Example

```tsx
// vela.config.ts
import { defineConfig } from "vela-rbxts";

export default defineConfig();
```

```tsx
// src/client/App.tsx
export function Example() {
  return (
    <frame className="bg-slate-700 border border-slate-700 rounded-md px-4 py-3 w-80 h-27 gap-4">
      <textlabel Text="rbxts consumer harness" TextScaled TextWrapped />
      <textlabel Text="layout and spacing baseline" TextScaled TextWrapped />
    </frame>
  );
}
```

After transformation, supported utility classes are lowered into Roblox UI props and `className` is removed from the output.

## Commands

```bash
# Install dependencies
pnpm install

# Build all packages and apps
pnpm build

# Run development mode
pnpm dev

# Lint code
pnpm lint

# Check types
pnpm typecheck

# Clean workspace
pnpm clean
```

## Changelog

Release notes are kept in [CHANGELOG.md](./CHANGELOG.md).

## License

MIT. See [LICENSE](./LICENSE).
