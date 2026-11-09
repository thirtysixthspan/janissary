# Correct the client integration plan's disabled command-bar statements

**Complexity: 1/10** — one completed plan document; no production behavior changes.

Issue: `product/plans/complete/native-commands-10-client-integration.md` still says command-bar gating happens before classification, that every disabled line returns `false`, and that `quit` and `close` reach the server like the other disabled words. The shipped repair in `web/src/shared/command-bar/AppCommandBar.tsx` classifies first, then consumes and reports only a disabled `confirm-quit` or `confirm-close` verdict; every other disabled verdict returns `false` and reaches the server. Its Tests bullets still put `quit` and `close` in the returning-`false` group and expect the disabled `quit` App test to send a command.

## Goal

Make the completed plan describe the shipped consume-and-report split for disabled command-bar `quit` and `close` lines, so a future implementer or verifier does not reintroduce the bypass the repair removed or record the shipped behavior as a failure.

## Approach

- Rewrite the command-bar gating decision in "Decisions and dependencies" to classify the line first, consume and report only a disabled `confirm-quit` or `confirm-close` verdict with the canonical `quit` or `close` word and a tab label, and return `false` for every other disabled verdict so it reaches the server.
- Rewrite Proposed changes item 3 to the same order and split, keeping the rest of the item unchanged.
- Update the `AppCommandBar.test.tsx` Tests bullet so `theme`, `hist`, `queue`, `tasks`, `syntax theme`, and `profile launch` remain the returning-`false` group, while disabled `quit` and `close`/`exit` lines are consumed, reported, and open neither the quit confirmation nor the save guard.
- Update the `App.test.tsx` Tests bullet so a disabled `theme` line reaches the server and a disabled `quit` line calls `reportBlockedCommand` instead of sending a command.
- Leave Verification steps 1 and 3, and the help-page list in Proposed changes item 6, untouched.

## Implementation steps

1. `product/plans/complete/native-commands-10-client-integration.md` — replace the command-bar gating decision bullet, Proposed changes item 3, and the two affected Tests bullets.
2. Run `$janissary/scripts/run.mjs check-diff`.

## Tests

No new tests: this is a text-only correction and no behavior changes. The shipped split is already pinned by `web/src/shared/command-bar/AppCommandBar.test.tsx` and `web/src/App.test.tsx`, and the rewritten statements are checked against those cases and `web/src/shared/command-bar/AppCommandBar.tsx`.

## Out of scope

- Any production code, test, spec, help, or user-documentation change.
- The already-corrected Verification steps 1 and 3 and the help-page list in Proposed changes item 6.
- Rewriting the plan's other statements about server-refused disabled words, which remain accurate.
