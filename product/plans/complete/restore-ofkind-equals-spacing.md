# Restore the space after the equals sign in the driver tests' ofKind helper

**Complexity: 1/10** — 0 production lines, 0 production files, 0 behavioral requirements; a one-character whitespace fix confined to a test file (p=1.58)

The driver cancellation commit rewrote the otherwise unchanged module-level `ofKind` declaration in `src/acp/drive-loop.test.ts` as `const ofKind =(events …`, dropping the space after the equals sign while adding the pending-host helpers beside it. The change has no behavioural purpose, no lint rule catches it because formatting is deferred to Prettier, and the next `npm run format` would silently fold it into an unrelated diff.

## Goal

The `ofKind` declaration reads `const ofKind = (events: unknown[][], kind: string) => events.filter((event) => event[0] === kind);` again, exactly as it did before the driver cancellation commit. Nothing else in the file or the repository changes.

## Approach

Insert the single missing space on that one line. No production code, behaviour, or test logic is touched.

## Implementation steps

1. In `src/acp/drive-loop.test.ts`, change `const ofKind =(events` to `const ofKind = (events` on the module-level declaration.
2. Run `$janissary/scripts/run.mjs check-diff` and confirm `git diff` shows only that one line.

## Tests

No new tests. This is a whitespace-only change to a test file with no behaviour change, so there is no new behaviour to cover. The existing driver tests are the verification: every `describe('driveToolLoop', …)` and `describe('runToolLoop', …)` test in `src/acp/drive-loop.test.ts`, including the three cancellation tests built on `drivePending`, must still parse and pass under `check-diff`.

## Specs and documentation

None. No user-visible behaviour changes.

## Out of scope

- Any other formatting in `src/acp/drive-loop.test.ts` or elsewhere.
- Running Prettier over the file or the repository.
