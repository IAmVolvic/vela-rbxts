# Agent Working Rules

## Comments

- **No unnecessary comments.** If the code is self-explanatory, do not add a
  comment. Do not write comments that merely restate the code (repeating what it
  does).
- **Keep them short.** When a comment is truly needed, write it on a single line
  as concisely as possible. Avoid verbose explanations and block comments.
- **Use them rarely.** Do not comment often. Leave a comment only for a
  non-obvious "why" (intent, trade-off, or reason for a workaround).
- **No changelog comments.** Do not add comments that announce changes such as
  "added feature", "new", "newly created function", dates, or authors. Git
  history and commit messages handle that.
- **No dead-code comments.** Do not leave commented-out code. Delete it if it is
  not needed.
- **No excessive TODOs.** Do not add `TODO`/`FIXME` unless tracking is genuinely
  required.
- **Follow surrounding code.** Match the comment density and style of the
  existing file. Do not raise the density by adding new comments.
