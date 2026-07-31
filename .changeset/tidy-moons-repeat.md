---
"@vela-rbxts/compiler": patch
---

Fix two runtime host defects: breakpoint and orientation variants never matched because `Camera.ViewportSize` was only read at mount while it still reports 1x1, and `divide-*` counted lowered helper elements as content, placing a separator above the first child.
