---
"vela-rbxts": minor
---

Install only the host you emit for.

`vela-rbxts` depended on `@rbxts/react` and `@rbxts/vela-runtime` outright, so a
Vide project got both — and Rojo maps the whole `node_modules/@rbxts` directory
into the place, which is the trap the three-package runtime split exists to
avoid. The Vide host was never a dependency at all, so the specifier its emit
imports did not resolve until you added it by hand.

Both hosts, and both UI libraries, are optional peers now.

**This changes the install step.** A React project adds the runtime it was
getting transitively:

```bash
pnpm add vela-rbxts @rbxts/vela-runtime @rbxts/react @rbxts/react-roblox @rbxts/services
```

A Vide project installs the Vide host instead, and no React:

```bash
pnpm add vela-rbxts @rbxts/vela-runtime-vide @rbxts/vide @rbxts/services
```
