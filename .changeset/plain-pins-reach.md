---
"@vela-rbxts/compiler": patch
"@rbxts/vela-runtime": patch
---

Let the pin under a `SurfaceGui` reach a subtree the caller built.

A mount function that portals a `<surfacegui>` and fills it with what it was
handed is the shape a project reaches for, and the offsets in those children
were lowered in the caller's file, against the viewport. React puts them back
after the fact by walking the elements the container is given, and that walk
read the props of a host element and turned around at everything else: children
written as `<><frame className="p-4" /></>`, or under a wrapper of the caller's
own, went on scaling with the screen. A fragment, a wrapper and a provider read
no context of their own, so the walk carries through them now. Putting a literal
back twice finds nothing left to do, which is what the consumer at a component
root was already relying on.

The fade an `opacity-*` opens has the same reach now. It stops at a component and
at a runtime host on purpose, since both read the alpha for themselves and a
second application would multiply it, but a fragment reads nothing and renders
what it was given as it is, so what a caller built under one went unfaded. It
carries through a fragment now and stops where it always did.

A component a file exports without naming, `export default (props) => …`, is
read as a component root too. The rule that finds one reads a name and a default
export has none, so such a component heard about neither the pin a `SurfaceGui`
opened over it nor the fade an `opacity-*` opened around it.
