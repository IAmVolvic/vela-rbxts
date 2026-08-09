# Vide support design

Design for making Vela emit for [Vide](https://centau.github.io/vide/) — the
`@rbxts/vide` port maintained at [littensy/vide](https://github.com/littensy/vide) —
alongside the React target it emits for today.

Scope agreed for v1: **phases 0–4**. Motion (`transition-*`, `animate-*`) is deferred
to a follow-up. Runtime packaging is a **three-package split**, decided up front.

## 1. What is actually different

Vide's JSX intrinsics are `[K in keyof CreatableInstances as Lowercase<K>]`, the same
lowercase Roblox class names `@rbxts/react` uses, and its props are Roblox instance
properties directly. A statically lowered element —
`<frame BackgroundColor3={...}><uipadding/><uicorner/></frame>` — is valid, identical
source under both targets. The static path is therefore close to free.

The reactivity model is where the two diverge.

| | React (`@rbxts/react`) | Vide |
| --- | --- | --- |
| Re-render | Yes | **No** — a component body runs once |
| Dynamic prop | Plain value, refreshed by re-render | `Derivable<T> = T \| (() => T)` — **must be a thunk to be tracked** |
| State | `useState` | `source()` |
| Effects | `useEffect` | `effect()` / `cleanup()` |
| Context | `createContext` + Provider | `context()` + `<Provider>` whose children is `() => Node` |
| Instance handle | `forwardRef` / `ref` | no ref — `action?: (instance: T) => void` |
| Conditional children | Re-render | `<Show>` / `<Switch>`, or imperative |
| Animation | External driver | built-in `spring()` |

Vide's `Vide.Attributes { children?: Node }` is the exact analogue of the
`React.Attributes` seam Vela augments today: `ActionAttributes extends Attributes`
carries it to every intrinsic, and `JSX.IntrinsicAttributes extends Vide.Attributes`
carries it to every component.

## 2. Where the current code is React-coupled

Reused unchanged:

- `packages/compiler/src/semantic/`, `utilities/`, `config/`, `ir/`, `class_value/` —
  the whole token → `StyleIr` pipeline
- `packages/compiler/src/editor/` — the LSP needs no target awareness
- `packages/config`, `packages/core`, `packages/ir`, `packages/types`

Coupled:

| Location | Coupling |
| --- | --- |
| `transform/runtime_host.rs` | `createVelaRuntimeHost` import preamble and module specifier |
| `transform/context.rs` | builds the host JSX element |
| `swc/builders.rs` `create_tests_attr` | emits `[cond ? true : false]`; Vide needs thunks |
| `swc/builders.rs` `create_opacity_provider` | emits a React context provider element |
| `transform/rem.rs` | `__VelaRem.udim2(v, slot)` returns a React `Binding` — the one React dependency on the *static* path |
| `transform/fade.rs` | `cloneElement`-based fade |
| `packages/runtime/src/index.ts` | 5797 lines, but only **45 React call sites**, concentrated in the `forwardRef` host body, `__VelaEnv`, `__VelaOpacity`, and the margin/divide/padding `createElement` calls |

## 3. Decisions

### D1 — Compiler: an `EmitTarget` seam under `transform`

The semantic layer is already target-neutral; only the IR → JSX bake diverges.

Landed in `src/transform/target/` as:

```rust
trait EmitTarget {
    fn runtime_module_items(&self, config: &TailwindConfig, needs: &RuntimeNeeds<'_>) -> Vec<ModuleItem>;
    fn host_element_name(&self) -> &'static str;
    fn tests_attr(&self, tests: Vec<Expr>) -> JSXAttrOrSpread;
    fn opacity_provider(&self, alpha: f64, children: Vec<JSXElementChild>) -> Box<JSXElement>;
    fn fade_element(&self, child: Expr) -> Box<JSXElement>;
}
```

`VelaTransformer` carries a `&'static dyn EmitTarget`. Everything else in
`swc/builders.rs` — props, casts, helper children — stayed shared, because Vide reads
the same host tags and Roblox property names React does.

### D2 — Runtime: three packages

| Package | Contents | Peer |
| --- | --- | --- |
| `@rbxts/vela-runtime-core` | resolution engine, theme normalization, rem math, rich text, margin/divide computation | none |
| `@rbxts/vela-runtime` | React host (name kept for compatibility) | `@rbxts/react` |
| `@rbxts/vela-runtime-vide` | Vide host | `@rbxts/vide` |

Luau has no tree shaking, so a shared root index would drag React into every Vide
project. Separate packages remove the resolution question entirely; the compiler picks
the specifier per target.

The Vide host is not a re-rendering component but a factory that wires effects once:

```
VelaVideHost(props) →
  hovered / pressed / focused = source(false)
  create(tag)({
    ...static props,
    ...each resolved prop as a () => resolve(...)[prop] thunk,
    MouseEnter / MouseLeave / InputBegan composed with the user's handlers,
    action: (instance) => wire margin / divide / cleanup(),
  })
```

Things the React host reaches through `instanceRef` are simpler here, because the Vide
host holds the instance directly.

### D3 — Target selection: config, with tsconfig inference

`jsxFactory` is a program-wide setting, so React and Vide cannot be mixed in one
project. Selection is per project:

```ts
defineConfig({ framework: "vide" })  // default "react"
```

When unset, `packages/rbxtsc-host/src/project-config.ts` infers from the tsconfig
`jsxFactory` (`Vide.jsx` → `vide`). Per-file import sniffing is deliberately not done:
it buys nothing and surprises.

## 4. The hard parts

**Reactive boundary.** In React, `className={active ? "a" : "b"}` refreshes by
re-render. In Vide the user must write `className={() => active() ? "a" : "b"}`. The
compiler has to unwrap that arrow before branch lowering and re-wrap each test as a
thunk: `__velaTests={[() => cond ? true : false]}`. One unwrap step in
`class_value/collapse.rs`, plus `EmitTarget::tests_attr`.

**Rem bindings.** Resolved by phase 0 — see below. The emit is unchanged; only the
scaler's return type differs.

**Opacity context and fade.** Vide's `<Provider context={} value={}>{() => children}</Provider>`
takes a thunk for children, so the emitted element shape differs. `cloneElement` in
`fade.rs` becomes `Vide.apply(instance)({...})`.

**Conditional helper children.** A `uistroke` that only exists under `hover:` cannot be
re-rendered into place; the Vide host creates and destroys it imperatively under
`cleanup()`.

## 5. Phases

| Phase | Work | Risk |
| --- | --- | --- |
| 0. Spike | minimal `apps/vide-harness`; verify hand-written lowering output runs in Studio | **done** |
| 1. `EmitTarget` seam | introduce the trait with `ReactTarget`; zero behavior change | **done** |
| 2. Runtime split | extract `-core`, rebuild the React host on it; zero behavior change | medium — touches release plumbing |
| 3. Vide host (MVP) | static lowering, runtime `className` resolution, rem. No variants | medium |
| 4. Reactive boundary | arrow unwrap, thunked tests, hover/pressed/focused, opacity context, margin/divide | **high — the core of the work** |

Deferred past v1: motion (`transition-*`, `animate-*`) on a Vide `spring()` driver;
static analysis of `className` inside `<Show>`/`<For>`/`<Index>`/`<Switch>`; the
`changed()` macro interaction; fine-grained `action` composition ordering (v1 fixes
"user action runs after Vela's").

Phases 1 and 2 are what make everything after them unable to regress the React path.

## 6. Phase 0 results

`apps/vide-harness` holds five cases taken verbatim from `transform()`'s React output
and ported to Vide, against a prototype of the Vide runtime in
`src/client/vela-vide.tsx`. All five were measured running in Studio.

**Confirmed**

- Static lowering output compiles and runs under Vide **unchanged**. Roblox property
  names, lowercase intrinsics and injected helper children all carry over.
- Rem scaling needs **no emit change at all**. `__VelaRem.scale(new UDim(0, 8), 0)`
  stays as written; Vide's `Derivable<T>` accepts the thunk the scaler returns where
  React accepted a `Binding`. Measured at a 1474px viewport: `CornerRadius` resolved to
  `(0, 6)` and `PaddingTop` to `(0, 12)` against raw `8` and `16`. `EmitTarget` loses
  its `rem_binding` method.
- Thunked `__velaTests` re-drive their rules with no re-render — the core risk of the
  whole design. A source flipping on a 1s period drove the element between
  `Color3.fromRGB(251, 44, 54)` and `Color3.fromRGB(43, 127, 255)`, and the rule's
  `BackgroundTransparency` override beat the static value.
- `hover:` works: driving the mouse onto the button moved it to the hover color and
  off it moved it back.
- Width rules work: at 1474px the `md` rule composed `SizeX` into `Size` as
  `{0.5, 0}, {0, 0}`.
- The type seam holds. `declare global { namespace Vide { interface Attributes } }`
  merges into Vide's UMD namespace and reaches intrinsics, components, and the
  `() => ClassValue` derivable form. Checked against a negative control.

**Found, not in the original design**

- `Vide.create()` passes the tag straight to `Instance.new()`, so a lowercase
  `__velaTag` dies there. Only `jsx.luau` carries the ReflectionService lowercase map.
  The Vide host must route through `jsx` — which also gets it the `action` and
  `*Changed` pass-through for free.
- `jsx` is missing from `@rbxts/vide`'s published `index.d.ts` even though it exists at
  runtime and is what `jsxFactory` points at. Worth an upstream issue; cast for now.
- `@rbxts/vide@0.6.1`'s `main` is `src/init.lua` but the file is `src/init.luau`.
  roblox-ts resolves it anyway.
- Package separation does not by itself keep React out of a Vide **place**. Rojo maps
  the whole `node_modules/@rbxts` directory, and under the hoisted linker that
  directory holds every scope package any workspace member pulled. `apps/vide-harness`
  copies only its own transitive `@rbxts` dependencies for this reason; consumer-facing
  docs will need the same warning.
