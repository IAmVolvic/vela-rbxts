# Contributing to vela-rbxts

Thanks for taking the time to contribute. This document covers how to get the
repository running locally, what CI expects from a pull request, and how
releases are cut.

## Prerequisites

| Tool | Version |
| --- | --- |
| Node.js | 24 |
| pnpm | 10.33.2 (see `packageManager`) |
| Rust | stable (see `rust-toolchain.toml`) |

The compiler is a Rust crate exposed to Node through N-API, and the language
server is a second Rust crate. A working `cargo` is required even for
`pnpm build` and `pnpm test`.

```bash
pnpm install
pnpm build
```

## Repository Layout

`packages/` holds the published packages, `apps/` holds the harnesses used to
validate real behaviour. The README has a table describing each one. The two
Rust crates live at `packages/compiler` and `packages/lsp`, and they are
separate cargo roots rather than one cargo workspace.

## Everyday Commands

```bash
pnpm build       # build every package and app
pnpm dev         # watch mode
pnpm lint        # biome
pnpm lint:fix    # biome with fixes
pnpm typecheck   # tsc --noEmit across the workspace
pnpm test        # turbo test, then the release script tests
pnpm clean       # remove build output
```

The Rust side is not covered by the pnpm scripts. Run it directly:

```bash
cargo fmt --manifest-path packages/compiler/Cargo.toml
cargo clippy --manifest-path packages/compiler/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path packages/compiler/Cargo.toml
```

Repeat with `packages/lsp/Cargo.toml` for the language server.

## What CI Checks

A pull request runs five jobs: `lint`, `build`, `typecheck`, `test`, and `rust`.
The `rust` job runs `cargo fmt --check`, `cargo clippy -- -D warnings`, and
`cargo test` against both crates, so unformatted Rust or a new clippy warning
will fail the build. Run the commands above before pushing.

## Tests

- Rust unit tests live beside the code in `#[cfg(test)]` modules.
- `apps/rbxts-harness` compiles a real roblox-ts project and asserts on the
  emitted Luau. This is where transformer lowering changes are proven.
- `apps/lsp-harness` drives the real `vela-rbxts-lsp` binary over stdio and
  asserts on diagnostics, completions, hover, and document colors.
- `apps/compiler-harness` is a browser preview of the compiler API.

A change to utility lowering usually needs both a Rust unit test and an
`rbxts-harness` probe. A change to editor behaviour usually needs an
`lsp-harness` probe.

## Adding a Utility Family

Utility support is spread across parsing, lowering, diagnostics, and the editor
surfaces. When adding a family, check that each of these is updated: the parser
and semantic tables in `packages/compiler/src/semantic`, the lowering in
`packages/compiler/src/transform`, completions and hover in
`packages/compiler/src/editor`, and the supported-surface table in the README.
`docs/utilities-roadmap.md` tracks what is planned.

## Commits

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/).
Scope by package where it helps, for example `feat(compiler):` or
`test(lsp-harness):`.

## Changesets

Every user-visible change needs a changeset. The packages are version-locked, so
a single changeset moves the whole release together.

```bash
pnpm changeset:add
pnpm changeset:check   # verify against origin/main
```

Changes that only touch CI, internal docs, or harness plumbing do not need one.

## Pull Requests

- Keep the change focused. Unrelated refactors make review harder.
- Fill in the pull request template.
- Describe how you verified the change, not just what you changed.
- Follow the comment rules in `AGENTS.md`: comments are for non-obvious
  intent, not for restating the code.

## Releases

Releases are automated and maintainer-driven. `docs/release.md` documents the
artifact-first pipeline. Contributors do not need to run any release command;
adding a changeset is enough.

## Code of Conduct

This project follows the [Code of Conduct](./CODE_OF_CONDUCT.md).
