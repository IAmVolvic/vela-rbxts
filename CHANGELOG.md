# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Versions are released in lockstep across every workspace package.

## [Unreleased]

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

### Fixed

- The setup guide named the declaration file `src/vela-rbxts.d.ts`, which collides with the package name under the `baseUrl` of `src` every roblox-ts project sets. The `import "vela-rbxts"` inside it resolved back to the file itself, so the augmentation never loaded and `className` was missing with no diagnostic. The guide now uses `src/vela-env.d.ts`.
- Repaired the compiler unit tests, which stopped compiling when `is_utility_allowed_on_host` began taking an `Option<&str>` for component support. `cargo test` had been failing while CI stayed green, because CI builds the napi binding rather than the test target.
- The VS Code extension declared `@vela-rbxts/rbxtsc-host` as a runtime dependency but never shipped it, so `vsce package` failed on the missing package and the config loader could not have resolved even if packaging had succeeded. The loader is now bundled into the extension.
- The config loader resolved `typescript` from its own install directory, which holds no TypeScript once the extension bundles it, so every `vela.config.ts` silently fell back to the built-in defaults in the editor. It now resolves from the config file's own project.
- Security overrides no longer cross major versions. The blanket ranges substituted incompatible APIs: `brace-expansion` 5 is ESM-only and broke `minimatch` 5 inside `vscode-languageclient`, `linkify-it` 6 broke the README renderer in `vsce`, and `js-yaml` 5 broke `read-yaml-file`, which made `changeset version` fail outright.

### Changed

- The packaged VS Code extension is versioned by date as `YYYY.M.DDNNN` — a UTC date plus a same-day build counter — rather than by the release tag. `packages/vscode-extension/package.json` keeps its semver version and still moves in lockstep with every other package. Set `VSIX_BUILD_NUMBER` to release more than once on a single date.
- Package versions are bumped in lockstep by changesets, and a release tag is cut automatically once the release pull request lands.

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

[Unreleased]: https://github.com/astra-void/vela-rbxts/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/astra-void/vela-rbxts/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/astra-void/vela-rbxts/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/astra-void/vela-rbxts/releases/tag/v0.2.0
[0.1.0]: https://www.npmjs.com/package/vela-rbxts/v/0.1.0
