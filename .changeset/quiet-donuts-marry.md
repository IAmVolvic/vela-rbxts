---
"@rbxts/vela-runtime-vide": patch
---

Stop deciding what a Vide element can become before it exists.

The host bound a thunk per prop name, which forces the names to be known up
front — so it read them off one untracked resolution, and a token that only a
later reading of a deferred `className` produced could not take effect. Which
props were written, which of `hover:`/`active:`/`focus:` were tracked, and
whether there were divide separators were all fixed at construction.

A host tag is an instance the host owns, so none of that has to be decided in
advance. The thunks are one effect that writes what the resolution now names —
which is what a re-render is for React. A name that appears is written; a name
that disappears goes back to what the element declared, or to the class default
where it declared nothing. Tweens moved into the same write. Trackers attach
unconditionally when the class value is deferred, and separators are built up
front like the helpers already were, so the children thunk can return the run
the resolution currently asks for.

**A handler was being called as if it were a value.** Reading the element's
declared props called every function among them, and in Vide an event handler
and a derivable prop are the same type — so a `MouseButton1Click` on any element
with a dynamic class value fired on every resolution reading. Vide tells the two
apart by asking the instance whether the property is a signal; the class answers
the same question here, which also covers `action` and the `*Changed` names.

What remains is narrow and now loud: a `m-*` arriving late cannot be honoured,
because the margin box is an instance above one that is already parented, and
the runtime warns rather than rendering it unspaced. On a component element the
prop names are still fixed at the call, since it is handed its props once.
