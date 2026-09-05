# Keep browser follow-up artifacts text-reviewable

**Complexity: 1/10** - replace one raw control byte in a completed plan and correct one stale test comment. Assertions and runtime behavior stay unchanged.

## Issue

`product/plans/complete/browser-frame-filter-test-not-binary.md` contains a literal NUL while explaining how a NUL was removed from a TypeScript test. Git therefore treats the plan itself as binary. Separately, `src/browser/e2e-server.test.ts` calls the allocator's choose-then-bind race a "port probe" race even though `e2e-ports.ts` deliberately performs no probe.

## Approach

Recreate the completed plan as ordinary UTF-8 text with the invisible byte represented as the textual `\0` escape. Rewrite only the stale comment in the browser-server suite so it describes another process taking an unreserved candidate between selection and bind. Do not change assertions, mocks, or production code.

## Implementation

1. Replace the completed plan's literal NUL with the two visible characters `\0` and clarify the affected design-decision label.
2. Rewrite the `port probe's race` comment to use the allocator's choose-then-bind terminology.
3. Confirm the plan is classified as text and scan it for remaining NUL bytes.
4. Remove only this resolved backlog entry.

## Tests

Run `./scripts/run.mjs check-diff`. Run the browser-server suite because its source changes, though no assertion changes. Verify `file` classifies the plan as text, a byte scan finds no NUL, and `git diff` renders the plan as line-oriented text.

## Documentation

The completed plan and test comment are the affected developer documentation. Product specs and user documentation already use the correct allocation terminology.

## Out of scope

- Changing port allocation or retry behavior.
- Changing frame-filter assertions or matching behavior.
- Adding a repository-wide control-byte lint rule.
