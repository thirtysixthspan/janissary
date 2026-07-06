# Code Guidelines

## File Size

- JavaScript/TypeScript files should be limited to **200 lines of code**.
- When a file exceeds this limit, the **only** acceptable way to shrink it is to
  **extract some of its code into another file** (a new, focused module) and import it
  back. Move a cohesive group of related logic out, don't shave lines off in place.
- Do **not** try to get under the limit by compacting code, removing comments, or
  deleting blank lines/spacing. These hurt readability without improving the design and
  are not a valid response to the line limit.

## Modularization

- Code that belongs to a single feature or functional area should be grouped in its own file.
- A file should have one clear responsibility. Avoid mixing unrelated concerns in the same file.
- Prefer small, focused modules over large, monolithic files.
