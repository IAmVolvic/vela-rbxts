---
"@vela-rbxts/compiler": patch
---

Group the inlined runtime into namespaces so it stops crowding Luau's local
register limit.

Scoping the runtime into one initializer moved its declarations off module
scope, but it did not shrink them: the initializer is itself a function, and it
had grown to 177 of the 200 local registers Luau allows one. Twenty-three more
top-level helpers — roughly one utility family's worth — and every transformed
file would have failed to compile with
`Out of local registers when trying to allocate <name>: exceeded limit 200`,
against generated code the author never wrote.

The runtime's helpers now live in thirteen namespaces. roblox-ts lowers a
namespace to `local Group = {} do ... end`, so a group costs one register that
lives on and its members are freed at the block's end. Growth is bounded by the
group a helper joins rather than by the runtime as a whole.

Measured on the rbxts harness, the busiest register file in an emitted file went
from 177 to 65. Both the harness and the compiler crate now assert a budget of
120, so crowding the limit again fails a test instead of a consumer's build.
