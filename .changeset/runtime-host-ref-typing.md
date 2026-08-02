---
"@vela-rbxts/compiler": patch
---

Type a `ref` on a runtime-hosted element from its host tag. The runtime host is
built with `forwardRef`, which pins one ref type for the whole component, so any
element a variant or motion utility promoted typed its `ref` as `Ref<unknown>` —
`<frame ref={frameRef} className={dynamic} />` would accept a ref to anything.
The host is now restated as a generic call whose ref follows `__velaTag`.
