# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Versions are released in lockstep across every workspace package.

## [Unreleased]

## [0.11.0] - 2026-08-08

### Added

- `vela` CLI, a second way to run Vela for projects that cannot register a transform plugin. `vela build` mirrors the source tree into `.vela/src`, transforming the `.tsx` files that use `className` and copying everything else through byte for byte, and `vela watch` re-transforms on change; `rbxtsc` then compiles the generated tree with no plugin registered. Both paths call the same compiler and emit identical Luau, and nothing about `vela.config.ts`, the declaration file, or the classes you write changes. Diagnostics stay anchored to the real sources, the command exits non-zero when a file fails to compile, an identical output is never rewritten so `rbxtsc -w` does not rebuild an untouched tree, and pruning is driven by a manifest of what the CLI emitted rather than by whatever else sits in the output directory.

### Changed

- `vela.config.ts` is transpiled and evaluated once per build instead of once per source file, on the CLI and the transformer path alike.

## [0.10.0] - 2026-08-04

### Changed

- `opacity-*` crosses a component boundary in both directions. A fade written around a component reached nothing it rendered, and a fade written on one lowered to `BackgroundTransparency` and no further, since the host tag is unknown there. The alpha now travels as React context: the transformer wraps what it cannot reach in a provider that renders no instance, so the tree keeps its shape and its names, and each component root is routed through a consumer that composes the alpha onto every channel the instances below it paint. The fade still ends at a `canvasgroup`, whose `GroupTransparency` composites the subtree in one pass. A class value that settles at render time is left whole to the runtime host, so an `opacity-*` inside a recipe reaches the subtree it is written over.

### Removed

- `opacity-unreachable-child`, along with the limitation it described.

### Fixed

- A motion driver's `transition` and `animate` are called as methods. A driver written the documented way carries an implicit `self`, but the runtime read the method off the table and called it detached, so every argument landed one place to the left and the driver died at mount, taking the tree down with it.

## [0.9.0] - 2026-08-04

### Added

- `opacity-unreachable-child`, reported for the two shapes the compile-time fade cannot reach — `{props.children}` and a component child whose instances are created elsewhere — instead of silently fading half a subtree.

### Changed

- `opacity-*` composes into everything the element draws and into the subtree written under it. It previously lowered to `BackgroundTransparency` alone, which is invisible on a label whose background is already transparent, and reached nothing below its own instance. It now fades every channel the host paints — `TextTransparency` on the text hosts, `ImageTransparency` on the image hosts, the `Transparency` of a `UIStroke` or `UIShadow` drawn alongside — and hands each element below it the running product, since Roblox has no inherited transparency. A `canvasgroup` on the way down ends the walk.
- `opacity-*` is no longer order-dependent. `bg-slate-700` clears `BackgroundTransparency`, so `opacity-50 bg-slate-700` came out opaque while the reverse order did not. The utility is now held until the whole class list is read and multiplied over whatever alpha the colors settled on, the way Tailwind reads it.

## [0.8.0] - 2026-08-03

### Added

- Every remaining utility family resolves on the runtime class path: positioning, the box constraints, the grid, gradients, `ring-*`/`outline-*`, shadows, `z-*`, `rotate-*`, `scale-*`, `opacity-*`, `order-*`, `leading-*`, `self-*`, `content-*`, `object-*`, `pointer-events-*`, `space-*`, `whitespace-*`, the ScrollingFrame family, and the rest of the text families. Color opacity modifiers and arbitrary values resolve there too, and `theme.fontFamily` now reaches the runtime theme. A utility the host element cannot carry is dropped rather than applied, since writing `TextColor3` onto a `Frame` is a hard Roblox error.

### Fixed

- The runtime host names `UIShadow` by its real class. `@rbxts/react` passes an unknown tag straight to `Instance.new`, which is case sensitive, so the lowercase form failed to instantiate and unwound the whole tree.

## [0.7.0] - 2026-08-03

### Added

- `setMotionDriver` in the plugin API. `transition` and `animate-*` no longer have to run on `TweenService`: a plugin names a module, the inlined runtime host imports it, and its `transition`/`animate` methods take over. Each method is taken over on its own, so a driver that only springs transitions keeps the built-in `animate-*` presets. Since the helper is inlined into every transformed module, the specifier must resolve from any of them — a package name or a `baseUrl`-relative path, and a relative one is rejected with a config error rather than resolving differently per file.

- `plugins` config option and the `plugin()` helper. A plugin registers class names of its own through `addUtilities`, either as a list of existing utilities (`btn: "bg-blue-600 rounded-lg px-4"`) or as Roblox properties written directly (`panel: { BorderSizePixel: "0" }`), and reads the resolved theme through `theme()`. Plugin functions run while the config resolves, so what the compiler, the runtime helper, and the LSP receive is the same plain utility table — which also lets `vela.config.json` state it as `plugins.utilities`. Registered utilities take variants, resolve on both the static and the runtime path, may reach through each other, and sort ahead of the plain utilities so a `bg-*` written beside one still wins.

- Class sorting: the compiler exposes a canonical class order as per-`className` edits, and the LSP offers it as the `source.sortVelaClasses` source action, which editors can also run on save. Utilities that can write the same Roblox property sort as one group, so the sort never changes which one wins.
- Arbitrary length values: `[16px]`, `[16]`, `[50%]` and their negatives resolve on the spacing, size, position, radius, and scrollbar-width families, on both the static and the runtime path. `text-[13px]`, `leading-[1.6]`, `rotate-[17deg]`, `z-[15]`, and `border-[3px]`/`ring-[3px]`/`outline-[3px]` read the number in their own unit. A payload the family cannot read still reports `unsupported-arbitrary-value`.
- `dark:` runtime variant. Roblox exposes no color scheme to a running game, so the app owns it: `dark:` matches when `Players.LocalPlayer` carries `VelaColorScheme = "dark"`, and the runtime host follows the attribute's change signal. An instance attribute is the only shared source that works here, since the runtime helper is inlined per module.
- `active:` and `focus:` runtime variants. `active:` follows mouse and touch presses through `InputBegan`/`InputEnded` (clearing on `MouseLeave`, since a release outside the element never reaches it), and `focus:` follows `Focused`/`FocusLost` on a `textbox` and `SelectionGained`/`SelectionLost` on every other element. Both compose with the consumer's own `Event` handlers and tween when the element carries `transition`.
- `theme.fontFamily` and the `font-{family}` utilities. The scale ships `sans` (Source Sans Pro), `serif` (Merriweather), and `mono` (Roboto Mono), and takes any Roblox font family asset — including uploaded `rbxassetid://` fonts. `font-*` resolves the fixed weight names first and reads anything else as a font family key, so family, weight, and style merge into a single `FontFace`.
- Scrolling frame utilities: `scroll-{x,y,xy}` and `scroll-none` map to `ScrollingDirection`/`ScrollingEnabled`, `scrollbar-w-*` and `scrollbar-none` set `ScrollBarThickness` from the spacing scale, `scrollbar-{color}` (opacity modifier included) sets `ScrollBarImageColor3`, and `canvas-{auto,auto-x,auto-y,none}` sets `AutomaticCanvasSize`. All four families are restricted to `scrollingframe`, with completions, hover, and document colors wired up.

### Changed

- `transition-colors`, `transition-opacity`, and `transition-transform` now narrow the tween to their property group instead of all being treated as `transition-all`. `transition-shadow` reports `unsupported-transition-value`: a shadow lives on a helper instance, which applies instantly, so there is nothing for the filter to hold back.
- `z-[N]` and `border-[Npx]` resolve instead of reporting `unsupported-arbitrary-z-index`/`unsupported-arbitrary-value`. A fractional `z-[1.5]` keeps the diagnostic, since `ZIndex` is an integer.
- `opacity-*` on a `canvasgroup` now lowers to `GroupTransparency` instead of `BackgroundTransparency`, so it fades the whole subtree the way CSS `opacity` does. Every other host keeps the previous behavior.
- Tailwind's own `scroll-*` utilities (`scroll-smooth`, `scroll-m-*`) report `unsupported-scroll-value` with the supported values instead of `no-roblox-equivalent`, now that the family carries a Roblox meaning.

### Fixed

- Layout, sizing, and text utilities resolve on the runtime class path. The runtime host implemented a strict subset of the static lowering, so a component whose `className` comes from a helper — the normal shape for a variant recipe — silently lost `flex-row`, `items-*`, `justify-*`, `w-fit`/`h-auto`/`size-fit`, `text-<size>`, `text-left|center|right`, and `font-<weight>`.

## [0.6.0] - 2026-08-03

### Added

- `auto-rows-*` and `auto-cols-*` name the grid's cross axis from the spacing scale. A column count says nothing about row height, and without one the extent stays at the 100px the engine already used.

### Changed

- `grid-cols-*` and `grid-rows-*` give each cell a real `CellSize`. `UIGridLayout` stamps `CellSize` onto every child and ignores whatever `Size` the child set for itself, and the grid utilities only ever set `FillDirection`, `FillDirectionMaxCells`, and `CellPadding` — so every cell fell back to Roblox's 100x100 default and a `grid-cols-2` of 430px cards collapsed to 100px squares. `grid-cols-N` now divides the axis it fills into N tracks and hands each cell back its share of the gap. Existing grids keep their row extent and gain correct track widths.

### Fixed

- `w-*` and `h-*` stop erasing each other on the runtime path. `Size` holds both axes, so a bundle naming one of them stated a whole `UDim2` and zeroed out the other — `md:w-32 md:h-32` kept only the height. Each axis is now carried on its own and composed over whatever `Size` the element already has.
- `text-{color}` resolves on the runtime path. The runtime resolver had no `text-` branch at all, so every text color in a dynamic class value was dropped without a diagnostic and the label kept Roblox's near-black default, while the identical class string lowered correctly when it happened to be static.

## [0.5.2] - 2026-08-03

No user-facing changes. Released to split the VS Code extension out of the npm release workflow.

## [0.5.1] - 2026-08-02

### Changed

- The VS Code extension's marketplace icon is redrawn as a sail.

## [0.5.0] - 2026-08-02

### Changed

- **Breaking for existing UI:** Roblox host defaults are neutralized. Roblox paints every `GuiObject` as an opaque gray box with a 1px border, and a framework that only ever adds properties can never take that back, so `bg-transparent` had to be repeated on almost every element. Any host element carrying a `className` now starts from `BackgroundTransparency = 1` and `BorderSizePixel = 0` unless a `bg-*` utility or an explicitly declared prop says otherwise; a background painted by a variant or a dynamic class value reopens it. Elements without a `className`, and components, are untouched. Anywhere the default gray background was load-bearing, the element now renders invisible — add the `bg-*` it was relying on, or set `preflight: false` in `vela.config.ts` to keep the old behavior.

### Fixed

- `order-*` is no longer ignored inside a flex container. The lowered `UIListLayout` left `SortOrder` at its engine default of `Name`, so children sorted alphabetically by instance name while `UIGridLayout` already sorted by `LayoutOrder`.
- The inlined runtime host no longer emits the deprecated `table.getn`. Luau's script analysis flagged every reference to it in consumer places; the array-length helper uses `size()` now, which roblox-ts lowers to the `#` operator.

## [0.4.2] - 2026-08-02

### Added

- `@vela-rbxts/compiler-wasm`, a WebAssembly build of the compiler, carried through the release pipeline.
- `apps/playground`, an in-Studio utility playground for exercising the compiler against real Roblox rendering.

### Fixed

- A `ref` on a runtime-hosted element is typed from its host tag instead of `unknown`.
- `transition` snaps no longer: a tween whose base value came from the static lowering now starts from that value rather than the element's default.
- A variant colour no longer leaves the base opacity modifier in place.

### Security

- The VS Code extension moved to `vscode-languageclient` 10, clearing GHSA-mh99-v99m-4gvg.

## [0.4.1] - 2026-07-31

### Added

- Malformed `configJson` passed to the compiler API reports an `invalid-config-json` error diagnostic instead of silently compiling against the default theme.

### Changed

- TSX parse failures report a human-readable message with line and column and anchor a source range, instead of dumping the parser's internal debug format.
- An invalid `vela.config.ts`/`vela.config.json` export names the failing theme key (for example `theme.extend.colors.surface.55`) instead of only saying a TailwindConfig-compatible object was expected.
- The `@vela-rbxts/compiler` root package no longer bundles the publish machine's native binary; platform binaries come only from the per-platform optional dependencies, shrinking the install for everyone else.

### Fixed

- Responsive and orientation variants (`sm:`, `md:`, `lg:`, `portrait:`, `landscape:`) never matched at runtime. The runtime host read `Camera.ViewportSize` only when it mounted, and Roblox reports `1x1` until the first frame renders, so every width rule was evaluated against a width of `1` and orientation was always `landscape`. The host now follows the camera's `ViewportSize` signal, so breakpoints resolve correctly and also react to window resizes.
- `divide-x-*`/`divide-y-*` drew an extra separator above the first child whenever the same element carried a utility that lowers a helper — `flex-col`, `gap-*`, `rounded-*`, `border`, `p-*` and friends. Those `UI*` elements arrive in the same children list and were counted as content; separators now sit between content children only.

## [0.4.0] - 2026-07-31

### Added

- `hover:` runtime variant: the runtime host tracks per-element MouseEnter/MouseLeave state (composing with any Event handlers the consumer declared, and attaching listeners only when a hover rule actually exists), so `hover:bg-*` works on its own and tweens when combined with `transition`.
- Arbitrary hex colors: `[#rgb]` and `[#rrggbb]` payloads resolve to `Color3.fromRGB` in every color family (`bg-[#ff0000]`, `border-[#0f0]`, `divide-[#333]`, ...). Non-hex arbitrary values keep the `unsupported-arbitrary-value` diagnostic.
- Color opacity modifiers: a trailing `/N` (0-100) lowers to the family's transparency prop — `bg-blue-600/50` sets `BackgroundTransparency = 0.5`, `ring-rose-500/25` sets the UIStroke `Transparency`. Families without a transparency prop (gradient stops, divide) keep the `unsupported-opacity-modifier` diagnostic.

### Changed

- `border-[N]`-style numeric arbitraries now report `unsupported-arbitrary-value` instead of `unsupported-border-value`, since bracket payloads are parsed as arbitrary colors first.

## [0.3.0] - 2026-07-31

### Added

- Layout utilities: `right-*`/`bottom-*` position from the far edges (`-right-*`/`-bottom-*` included), `content-*` and `self-*` map to UIListLayout cross-axis packing and UIFlexItem line alignment, `order-*` sets `LayoutOrder` (`first`/`last`/`none` and negatives included), `grid`/`grid-cols-N`/`grid-rows-N` create a UIGridLayout whose `CellPadding` picks up `gap-*`, `basis-*` sizes the main (row) axis, and `mx-auto`/`my-auto` center an axis through `AnchorPoint` without any wrapper.
- Transform utilities: `translate-x/y-*` lower fractions to `AnchorPoint` — so the `left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2` centering idiom works verbatim — and pixel values to `Position` offsets.
- `space-x/y-*` set `UIListLayout.Padding` together with the matching `FillDirection`, `pointer-events-none/auto` map to `Interactable`, `object-cover/contain/fill` map to `ScaleType` on image hosts (plus a Roblox-only `object-tile`), `overscroll-*` maps to `ElasticBehavior` on scrolling frames, and `ring`/`outline` merge into the same UIStroke `border-*` uses with `ApplyStrokeMode = Border`.
- Typography utilities: `leading-*` sets `LineHeight`, `italic`/`not-italic` merge with `font-*` weights into a single `FontFace`, `whitespace-normal/nowrap` alias `TextWrapped`, `uppercase`/`lowercase`/`capitalize` transform `Text` (at compile time for literals, through the runtime host otherwise), and `underline`/`line-through` enable `RichText` around escaped text — backing off with a diagnostic when the element manages `RichText` itself.
- Motion: `transition`/`duration-*`/`ease-*`/`delay-*` tween runtime style changes with TweenService instead of snapping, and `animate-spin/pulse/bounce` run preset loops. Both work from dynamic `className` values too, and warn (`motion-on-component`) on component elements, which cannot expose an instance to tween.
- Structural utilities: `m/mx/my/mt/mr/mb/ml-*` render a CSS-style margin box — a transparent wrapper padded by the margins, with layout props routed onto it — so margins participate in lists and absolute positioning; negative `-mt-*`/`-ml-*` pull through `Position`. `divide-x/y[-N]` and `divide-{color}` insert separator frames between an element's children.
- The runtime host renders through `forwardRef`, composing consumer refs with its own, so `asChild`-style slotting libraries (verified against lattice-ui) and plain refs reach the rendered instance.
- The default radius scale ships a `DEFAULT` key, so a bare `rounded` resolves to 4px like Tailwind.
- Editor: `className` values are collected from expression containers (arrays, objects, template literals, `cn()`-style calls) with a lexical fallback for files that fail to parse, completions are fuzzy-ranked server-side with theme color swatches and variant-aware replacement ranges, and the LSP returns incomplete lists so that ranking stays in charge on every keystroke.
- Diagnostics distinguish unknown variant prefixes, valid Tailwind families with no Roblox equivalent, and per-value errors for every new family instead of collapsing into one generic family error.
- `apps/lsp-harness`: a maintainer harness that drives the release LSP binary over stdio and asserts diagnostics anchoring, completions, hover, and document colors.

### Fixed

- `top-*` utilities were parsed as `to-*` gradient stops because of prefix ordering, so they never set `Position.Y`.
- Mixed scale/offset `Size`/`Position` values emitted `UDim2.new(...)`, which does not exist in roblox-ts, failing the consumer's typecheck; they now emit `new UDim2(...)` and the runtime host parses both spellings.
- Consumer refs on runtime-host elements were silently dropped, since the host was a plain function component.

## [0.2.1] - 2026-07-20

### Added

- The project config may be written as `vela.config.json`, holding the same object `defineConfig()` takes. `vela.config.ts` still wins when both sit in the same directory. A roblox-ts `tsconfig.json` includes only `src`, so a root-level `vela.config.ts` makes typed ESLint setups report the file as not included in the project; the JSON form avoids that entirely. `vela-rbxts/schema.json` ships alongside it for editor completion through `$schema`.
- Color palettes may carry a `DEFAULT` key, which is what a bare family name resolves to, following the convention Tailwind uses for nested color objects. Every built-in palette now ships `DEFAULT` mirroring its `500`, so `bg-slate` works with no configuration. A palette without `DEFAULT` still reports `color-missing-shade` when referenced bare, and `DEFAULT` is reachable only through the bare name — `bg-slate-DEFAULT` is not a class.

### Changed

- The packaged VS Code extension is versioned by date as `YYYY.M.DDNNN` — a UTC date plus a same-day build counter — rather than by the release tag. `packages/vscode-extension/package.json` keeps its semver version and still moves in lockstep with every other package. Set `VSIX_BUILD_NUMBER` to release more than once on a single date.
- Package versions are bumped in lockstep by changesets, and a release tag is cut automatically once the release pull request lands.

### Fixed

- The setup guide named the declaration file `src/vela-rbxts.d.ts`, which collides with the package name under the `baseUrl` of `src` every roblox-ts project sets. The `import "vela-rbxts"` inside it resolved back to the file itself, so the augmentation never loaded and `className` was missing with no diagnostic. The guide now uses `src/vela-env.d.ts`.
- Repaired the compiler unit tests, which stopped compiling when `is_utility_allowed_on_host` began taking an `Option<&str>` for component support. `cargo test` had been failing while CI stayed green, because CI builds the napi binding rather than the test target.
- The VS Code extension declared `@vela-rbxts/rbxtsc-host` as a runtime dependency but never shipped it, so `vsce package` failed on the missing package and the config loader could not have resolved even if packaging had succeeded. The loader is now bundled into the extension.
- The config loader resolved `typescript` from its own install directory, which holds no TypeScript once the extension bundles it, so every `vela.config.ts` silently fell back to the built-in defaults in the editor. It now resolves from the config file's own project.
- Security overrides no longer cross major versions. The blanket ranges substituted incompatible APIs: `brace-expansion` 5 is ESM-only and broke `minimatch` 5 inside `vscode-languageclient`, `linkify-it` 6 broke the README renderer in `vsce`, and `js-yaml` 5 broke `read-yaml-file`, which made `changeset version` fail outright.

## [0.2.0] - 2026-07-20

First release published as a public project, with release tooling, documentation, and package metadata prepared for external consumers.

### Added

- `className` on React components is now lowered: static utilities resolve at compile time and are passed to the component as props, with helper elements added as its first children. Dynamic expressions and runtime-aware variants are wrapped in the inline runtime helper, which renders the component with the resolved props. The component must forward what it does not consume to a Roblox host element.
- Editor support for `className` on components: completions, hover, document colors, and diagnostics work there too. Utilities restricted to specific host elements, such as `text-*`, stay available because a component's host element is not known.
- A diagnostic for `className` on Roblox host elements that are not supported, instead of passing an unknown property through to the runtime.
- Flexbox utilities: `flex`, `flex-row`, `flex-col`, `justify-{start,center,end}`, `items-{start,center,end}`, plus flex distribution and flex-item utilities, lowered to `UIListLayout`.
- Aspect ratio utilities `aspect-square`, `aspect-video`, and arbitrary `aspect-[W/H]`, lowered to `UIAspectRatioConstraint`.
- Transform utilities `rotate-*` / `-rotate-*` mapped to Roblox `Rotation`.
- Effect utility `opacity-*` mapped to `BackgroundTransparency`.
- Scale (`UIScale`) and stroke line-join utilities.
- Class token spans exposed from the compiler for editor tooling.
- LSP: project config loading, quick-fix code actions, document highlight, and incremental text synchronization.
- Packaged LICENSE, README, and full npm metadata (description, keywords, homepage, bugs) for every published package.

### Changed

- The transformer now inlines its runtime helper into transformed modules instead of requiring an external runtime package. No Vela-specific Rojo mapping or runtime dependency is needed.
- Internal `tailwind`-prefixed identifiers and exports renamed to `vela`; `vela-rbxts` keeps backward-compatible transformer export aliases.
- Release pipeline verifies packed tarballs against a temporary external roblox-ts consumer before publishing.
- Bumped `@rbxts/types` to `^1.0.935`.
- Deduplicated compiler completion candidates for faster editor responses.

### Removed

- The standalone runtime package, superseded by the inline runtime helper.
- Deprecated `createRbxtsTailwindProgramTransformer` export from `@vela-rbxts/rbxtsc-host`.

### Fixed

- Runtime-aware `className` on an element with children no longer fails to compile. Swapping in the runtime helper renamed only the opening tag, so the mismatched closing tag produced TS17002.
- Compile-time diagnostics are anchored to the offending token in the `className` literal. They previously used the first textual match in the file, so a comment or unrelated string containing the same text stole the position.
- The `tsconfig.json` example in the README was missing `incremental`, which made `tsBuildInfoFile` fail with TS5069 on a fresh setup.
- `@vela-rbxts/rbxtsc-host` strips `vela-rbxts` imports when loading `vela.config.ts`.
- String polyfills and locally aliased `table`/`string` methods in the emitted runtime helper.
- LSP no longer shows a console window when spawning the server on Windows.
- VSIX marketplace version normalization for explicit `VSIX_VERSION` overrides.

### Security

- Updated development dependencies to clear 24 advisories reported against the workspace, covering `turbo`, `esbuild`, `vitest`, `@vscode/vsce`, and transitive packages pinned through pnpm overrides. None of these were runtime dependencies of the published packages.

## [0.1.0] - 2026-04-24

Initial npm publish of the `vela-rbxts` toolchain.

### Added

- `vela-rbxts`: main package adding `className?: ClassValue` to `React.Attributes`, the `defineConfig()` helper, and the `./transformer` entry for roblox-ts.
- `@vela-rbxts/compiler`: native Rust/N-API compiler that resolves, validates, and lowers utility classes, with editor APIs for completions, hover, diagnostics, and document colors.
- `@vela-rbxts/rbxtsc-host`: host adapter that resolves `vela.config.ts`, filters eligible files, and bridges compiler diagnostics into `rbxtsc`.
- `@vela-rbxts/config`, `@vela-rbxts/core`, `@vela-rbxts/ir`, `@vela-rbxts/types`: config schema and defaults, host element contracts, shared IR, and public types.
- Standalone Rust LSP server and the `vela-rbxts-lsp` VS Code extension.
- Supported utilities: colors (`bg-*`, `text-*`, `image-*`, `placeholder-*`), `border*`, `rounded-*`, `z-*`, padding and `gap-*`, sizing (`w-*`, `h-*`, `size-*`).
- Runtime-aware variants: `sm:`, `md:`, `lg:`, `portrait:`, `landscape:`, `touch:`, `mouse:`, `gamepad:`.
- Artifact-first release pipeline (`plan` → `build` → `pack` → `verify` → `publish`) with a cross-platform CI matrix.

[Unreleased]: https://github.com/astra-void/vela-rbxts/compare/v0.11.0...HEAD
[0.11.0]: https://github.com/astra-void/vela-rbxts/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/astra-void/vela-rbxts/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/astra-void/vela-rbxts/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/astra-void/vela-rbxts/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/astra-void/vela-rbxts/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/astra-void/vela-rbxts/compare/v0.5.2...v0.6.0
[0.5.2]: https://github.com/astra-void/vela-rbxts/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/astra-void/vela-rbxts/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/astra-void/vela-rbxts/compare/v0.4.2...v0.5.0
[0.4.2]: https://github.com/astra-void/vela-rbxts/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/astra-void/vela-rbxts/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/astra-void/vela-rbxts/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/astra-void/vela-rbxts/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/astra-void/vela-rbxts/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/astra-void/vela-rbxts/releases/tag/v0.2.0
[0.1.0]: https://www.npmjs.com/package/vela-rbxts/v/0.1.0
