---
"@vela-rbxts/rbxtsc-host": patch
---

Let a `vela.config.ts` reach the framework inference.

The tsconfig `jsxFactory` only decided the framework for a project whose config
never named one, and that was read off the export. `defineConfig` resolves an
unset framework to the default before returning, so every config that went
through it looked like it had asked for React, and a Vide project had to name
`framework: "vide"` by hand after all.

The resolved configs `defineConfig` hands back are tracked now, so only an
export it did not produce is read as a declaration.
