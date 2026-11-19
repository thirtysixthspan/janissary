# Share the file read max limit with head/tail count validation

**Complexity: 2/10** — ~1 added production line in 1 file, 2 requirements, 8 scenarios (p=3.61)

Recorded work item from PR 2115's head-branch backlog (`product/backlog/pull-request.md`, first entry). The head/tail parser hardcodes its own 2000-line cap while `file read` owns the real limit in `FILE_READ_MAX_LIMIT`, so the accepted count can drift from what `formatFileLines` silently clamps.

## Goal

Make `file head` and `file tail` count validation derive its maximum from the same constant `file read` uses, so the parser can never accept a count the formatter clamps silently. No user-visible behavior changes.

## Design decisions

- `FILE_READ_MAX_LIMIT` at `src/file-read/command.ts:9` is the single source of truth. `FILE_HEAD_TAIL_MAX_LINES` stays exported for callers and tests, but its value is assigned from that constant instead of a literal.
- The import is NodeNext-style (`../file-read/command.js`), matching every other relative import in `src/`.
- The bound is enforced in one place: `scanArguments` at `src/file-head-tail/command.ts:24` already rejects `value > FILE_HEAD_TAIL_MAX_LINES`; it needs no logic change.
- The executors in `src/file-head-tail/tab-head-tail.ts` stay untouched: head still calls `readWorkspaceLines`, tail still calls `formatFileLines`. No executor behavior is part of this fix.

## Proposed changes

- `src/file-head-tail/command.ts`: import `FILE_READ_MAX_LIMIT` from `../file-read/command.js` and define `export const FILE_HEAD_TAIL_MAX_LINES = FILE_READ_MAX_LIMIT;`.
- `src/file-head-tail/command.test.ts`: import `FILE_HEAD_TAIL_MAX_LINES` and use it for the accepted maximum (`-n ${FILE_HEAD_TAIL_MAX_LINES}` and the matching expected count) and for the rejected maximum (`${FILE_HEAD_TAIL_MAX_LINES + 1}`), instead of the `2000` and `2001` literals. Leave the default-10, zero, negative, non-numeric, repeated-flag, and usage-line cases verbatim.

## Tests

- Boundary: maximum count accepted; count one above the maximum rejected with the matching usage line.
- Unchanged cases remain as-is and must still pass: default 10, leading zeros, case-insensitive keywords, repeated whitespace, missing path and malformed lines, repeated `-n`, zero, negative, non-numeric, fractional and exponent counts, `-n` without a value, unknown flag, canonical usage text.
- Executor tests in `src/file-head-tail/tab-head-tail.test.ts` still pass unchanged, confirming `readWorkspaceLines` and `formatFileLines` behavior is intact.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after the source change and again after the test change; both must be clean.

## Out of scope

No change to `file read` itself, to `formatFileLines` clamping, to the head/tail executors, to usage text, to help pages or specs (the fix has no user-visible behavior change, and the feature's spec/help work belongs to pending subplan 9), and no change to the second backlog entry.
