---
"@vela-rbxts/compiler": patch
---

Give a margin side one slot, so the last class written to it is the one that
lands.

A negative top or left margin cannot be UIPadding, so it moves the element
instead, and that move was kept in an accumulator of its own beside the padding
each side already had. Two slots per side meant neither could overwrite the
other: `-ml-2 -ml-2` shifted by 16 rather than 8, `ml-4 -ml-2` applied a 16
padding *and* an 8 shift, and `-ml-2 ml-4` emitted exactly the same thing, so
the order the two were written in stopped mattering. `-ml-0` had nothing to
subtract and vanished, leaving an `ml-4` in front of it standing.

Each side is one signed slot now. The last margin written to it wins, a side
that ends up negative moves the element, and one that ends up positive pads it.
A negative right or bottom margin still reports `unsupported-negative-margin`:
it would have to pull the next sibling closer, which nothing here can reach.
