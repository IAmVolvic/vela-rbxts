---
"@vela-rbxts/compiler": minor
"@vela-rbxts/config": minor
---

Add plugin utilities and a motion driver seam.

`plugins.utilities` lets a config name its own tokens, expanding either to a
utility class list or straight to Roblox property assignments, with a depth cap
so a self-referential definition fails the config rather than the build.

`plugins.motion` lets a driver take over transitions or animations one method at
a time; whatever it leaves alone stays on the built-in TweenService path.
