# Release Pipeline

This repository uses an artifact-first release pipeline with strict phases:

1. `plan`
2. `build artifacts`
3. `pack tarballs / VSIX`
4. `verify artifacts`
5. `publish npm`
6. `package VSIX`

`pnpm release:verify` now also spins up a temporary external roblox-ts consumer,
installs the packed Vela tarballs from `artifacts/npm`, compiles a small TSX
fixture with `rbxtsc`, and checks the emitted Luau for the expected transformer
output. Set `VELA_KEEP_PACKED_CONSUMER=1` if you want the temporary consumer
directory preserved after a successful run.

Publishing scripts never build. Build scripts never publish.

## Commands

Dry-run prerelease (`next`):

```bash
pnpm release:dry-run:next
```

Real prerelease (`next`):

```bash
pnpm release:next
```

Real stable release (`latest`):

```bash
pnpm release:latest
```

## Artifact Layout

All release outputs are under `artifacts/`:

```txt
artifacts/
  npm/      # packed .tgz tarballs + pack manifest
  native/   # compiler native .node artifacts by target
  lsp/      # lsp binaries by target
  vsix/     # packaged VSIX files
  logs/     # build logs/manifests
  verify/   # verification report
```

## Failure Handling

If native artifacts fail:

1. Re-run `pnpm release:build` and confirm all configured compiler targets are present in `artifacts/native`.
2. Ensure required toolchains are installed for the failed target (Windows runner for Windows, Zig only for Linux cross targets that need it).

If LSP artifacts fail:

1. Re-run `pnpm release:build` and confirm each target binary exists under `artifacts/lsp/<target>/`.
2. Verify Rust target toolchain installation for the failed target.

## VSIX Dependency On LSP

`pnpm release:vsix` requires already built LSP artifacts in `artifacts/lsp`.
The VSIX packaging phase stages those binaries through `@vela-rbxts/lsp` and fails if the current platform binary is missing.

## Local VSIX Build

```sh
pnpm --filter ./packages/vscode-extension package:vsix
```

This generates `packages/vscode-extension/dist/vela-rbxts-lsp-<version>-<host-target>.vsix`.
A specific VS Code target can be packaged explicitly:

```sh
pnpm --filter ./packages/vscode-extension package:vsix -- --target win32-x64 --out ./dist/vela-rbxts-lsp-<version>-win32-x64.vsix
```

Install the result with `code --install-extension <path-to-vsix>`. The packaged
extension id is `astra-void.vela-rbxts-lsp`. Packaging stages a temporary
snapshot and rewrites workspace dependencies in that staging directory only —
source files are not mutated.

## VSIX Versioning

The packaged extension uses a date version, `YYYY.M.DDNNN`, rather than the release tag:
a UTC date plus a same-day build counter, so `2026-07-20` first packages as `2026.7.20001`.
This applies to the staged manifest only — `packages/vscode-extension/package.json` keeps its
semver version and still moves in lockstep with the other packages.

Marketplace versions can never be reused or rolled back, so a second release on the same UTC
date needs `VSIX_BUILD_NUMBER=2` (1-999) — including a stable release that follows a
prerelease on that date. `VSIX_VERSION=2026.7.20005` overrides the whole version explicitly
when you need an exact value.

Every VSIX goes to the stable Marketplace channel; `--pre-release` is never passed. The
Marketplace separates channels by an odd/even minor version, which a date version cannot
express, and the two channels would otherwise collide on one number. A `vX.Y.Z-next.N` tag
still selects the `next` npm dist-tag — only the Marketplace channel is unaffected by it.

## Manual Dispatch Options

For `workflow_dispatch` on `.github/workflows/publish.yaml`:

- `dry_run=true`: validates release flow and runs VSIX packaging checks without real npm/Marketplace publishing.
- `vsix_version`: optional Marketplace-compatible `major.minor.patch` override for staged VSIX manifest version.
- `vsix_build_number`: same-day build counter (1-999) for the generated date version; bump it to re-release on one UTC date.
- `publish_vscode_extension=false`: package and upload VSIX artifacts only; skip Marketplace publish.
- `publish_vscode_extension=true`: publish VSIX artifacts to VS Code Marketplace, unless `dry_run=true`.
- `VSCE_PAT` is required only for real VS Code Marketplace publishing.
