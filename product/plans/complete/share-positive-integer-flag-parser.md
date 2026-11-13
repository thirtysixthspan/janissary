# Share the positive-integer flag parser between file read and file glob

**Complexity: 3/10** — ~5 added lines, 2 files edited, 8 test scenarios for the moved helper (p=4.04)

The `file glob` command parser in `src/file-glob/command.ts` carries a byte-identical copy of the private `positiveInteger` helper from `src/file-read/command.ts`. The subplan justified the copy as below the duplication detector's clone threshold, but the helper is five lines and about 56 tokens, which meets both minimums. A later change to the flag-value rules would also land in one command and silently not the other, so `file read` and `file glob` would drift in how they accept `--limit`.

## Goal

One exported `positiveInteger` helper serves both command parsers. Its behavior is unchanged: only an all-digit token that is a safe integer of at least 1 is accepted, and anything else, including a missing token, yields no value. Neither command module imports the other.

## Approach

Move the helper into a new top-level server module, `src/positive-integer.ts`, beside other small shared helpers such as `src/datetime.ts`. Export it and import it with a `.js` extension from both command modules. Neither command directory is a plugin, so the plugin import-boundary rules do not apply.

## Implementation steps

1. Create `src/positive-integer.ts` exporting `positiveInteger(value: string | undefined): number | undefined` with the existing body.
2. In `src/file-read/command.ts`, delete the private helper and import it from `../positive-integer.js`.
3. In `src/file-glob/command.ts`, delete the private helper and import it from `../positive-integer.js`.

## Tests

Add `src/positive-integer.test.ts` covering:

- `undefined` yields `undefined`
- `0` yields `undefined`
- `-3` yields `undefined`
- `1.5` yields `undefined`
- `1e3` yields `undefined`
- `007` yields `7`
- a digit string beyond `Number.MAX_SAFE_INTEGER` yields `undefined`
- a plain value such as `42` yields `42`

The existing limit cases in `src/file-read/command.test.ts` and `src/file-glob/command.test.ts` must keep passing unchanged.

## Out of scope

- Changing what either command accepts for `--limit` or `--offset`.
- Sharing any other part of the two argument scanners.
- Specs and help pages, since no user-visible behavior changes.
