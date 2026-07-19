# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Versions are released in lockstep across every workspace package.

## [Unreleased]

### Added

- `className` on React components is now lowered: static utilities resolve at compile time and are passed to the component as props, with helper elements added as its first children. Dynamic expressions and runtime-aware variants are wrapped in the inline runtime helper, which renders the component with the resolved props. The component must forward what it does not consume to a Roblox host element.
- A diagnostic for `className` on Roblox host elements that are not supported, instead of passing an unknown property through to the runtime.
- Editor support for `className` on components: completions, hover, document colors, and diagnostics now work there too. Utilities restricted to specific host elements, such as `text-*`, stay available because a component's host element is not known.

### Security

- Updated development dependencies to clear 24 advisories reported against the workspace, covering `turbo`, `esbuild`, `vitest`, `@vscode/vsce`, and transitive packages pinned through pnpm overrides. None of these were runtime dependencies of the published packages.

### Fixed

- Runtime-aware `className` on an element with children no longer fails to compile. Swapping in the runtime helper renamed only the opening tag, so the mismatched closing tag produced TS17002.
- Compile-time diagnostics are anchored to the offending token in the `className` literal. They previously used the first textual match in the file, so a comment or unrelated string containing the same text stole the position.
- The `tsconfig.json` example in the README was missing `incremental`, which made `tsBuildInfoFile` fail with TS5069 on a fresh setup.

## [0.2.0] - 2026-07-19

First release published as a public project, with release tooling, documentation, and package metadata prepared for external consumers.

### Added

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

- `@vela-rbxts/rbxtsc-host` strips `vela-rbxts` imports when loading `vela.config.ts`.
- String polyfills and locally aliased `table`/`string` methods in the emitted runtime helper.
- LSP no longer shows a console window when spawning the server on Windows.
- VSIX marketplace version normalization for explicit `VSIX_VERSION` overrides.

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

[Unreleased]: https://github.com/astra-void/vela-rbxts/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/astra-void/vela-rbxts/releases/tag/v0.2.0
[0.1.0]: https://www.npmjs.com/package/vela-rbxts/v/0.1.0
