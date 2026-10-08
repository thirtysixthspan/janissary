# One owner for the "is this path inside that root" test

## Complexity

5/10 — one new predicate beside `containedPath`, three call sites rewired to it, one comment, and two new regression cases per suite. No new architecture; the risk is that the four copies disagree at the edges today, so the rewired call sites must keep their current answers.

## Goal

`containedPath` in `src/file-navigator/batch-paths.ts` is the canonical containment test, but three further modules re-derive its tail: `inside` in `src/remote/filesystem/path-containment.ts` carries it with the resolve step removed, `resolveSelected` in `src/file-navigator/selection-action.ts` spells a prefix comparison against the root, and `shellCwd` in `src/remote/serve-processes.ts` clamps a resolved cwd with a third spelling. The containment invariant is maintained four times, each copy treating absolute inputs, trailing separators and `..` differently, and the failure mode is a file read or write outside the navigator root — the local-first boundary breach the confinement tests exist to prevent. Give the predicate one owner.

## Approach

Publish `containedAbsolute(root, absolute)` beside `containedPath` in `src/file-navigator/batch-paths.ts` — the resolve-free tail as a boolean predicate — and have `containedPath` call it, so the tail exists once. Rewire the three copies to it: `inside` in `path-containment.ts` (which needs the rule for an already-realpath'd absolute candidate), the prefix comparison in `selection-action.ts`, and the clamp in `serve-processes.ts`. The four spellings agree on every input the application produces today (resolved, separator-free paths), so the rewiring keeps each caller's answers; the new test cases pin the two shapes the copies could have disagreed on — an absolute input and a trailing separator — in the two suites that already cover the refused-path answers. `src/file-navigator/remote-cwd.ts` runs the same test over `path.posix` for a remote workspace and deliberately does not import the predicate, since its path API differs; it gets a comment saying so.

## Implementation

1. In `src/file-navigator/batch-paths.ts`, add `containedAbsolute(root: string, absolute: string): boolean` returning the tail `containedPath` currently inlines — `path.relative(root, absolute)` is `''`, or is neither `..`, nor under `..${path.sep}`, nor absolute — and reduce `containedPath` to its input guards plus `path.resolve` plus a call to it.
2. In `src/remote/filesystem/path-containment.ts`, delete the local `inside` and call `containedAbsolute` at its one use site.
3. In `src/file-navigator/selection-action.ts`, replace `resolveSelected`'s `absolute === root || absolute.startsWith(...)` comparison with `containedAbsolute(root, absolute)`.
4. In `src/remote/serve-processes.ts`, replace `shellCwd`'s inline prefix test with `containedAbsolute(this.workspaceDir, cwd) ? cwd : this.workspaceDir`.
5. In `src/file-navigator/remote-cwd.ts`, add a comment above its `path.posix` spelling noting it is the same containment test over a different path API, deliberately not imported.
6. Run `./scripts/run.mjs check-diff` after the predicate lands and again after each rewired call site.

## Tests

- `src/file-navigator/batch.test.ts` gains one case driving an absolute input and one driving a trailing-separator traversal through `moveBatch`, asserting both are refused as failures with the path echoed in `failedPaths`.
- `src/remote/file-navigator-refusal-contract.test.ts` gains the same two shapes through `deleteOne` on both trees, asserting the local and remote answers still match and carry the `outside this file navigator` reason.
- The existing suites covering the refused-path answers — the rest of `batch.test.ts` and the whole refusal-contract file — must keep passing unchanged; their cases pin the answers the four spellings must keep giving.

## Out of scope

- `src/file-navigator/remote-cwd.ts`'s own `path.posix` spelling — a comment only, per the item.
- The many `containedPath` consumers (`filesystem-port.ts`, `navigation.ts`, `filesystem.ts`, `batch.ts`, `remote/file-cache.ts`, `serve-file-navigator.ts`, `refusal.ts`); their calls are unchanged and keep resolving through the shared tail.
- Any change to the refusal wording, the `realDirectory`/`exists`/`duplicateNames` helpers, or the confinement behavior itself.

## Verification

- `./scripts/run.mjs check-diff` passes after each step.
- A search for the removed spellings — `inside(` in `path-containment.ts`, the `root + path.sep` comparison in `selection-action.ts`, and the `startsWith(\`..${path.sep}\`)` clamp in `serve-processes.ts` — finds nothing left.
- `containedPath`'s own answers are unchanged: its guards plus the shared tail produce the same `undefined`/absolute results as before.

## Documentation and specification impact

None. The containment answers are unchanged; this is a de-duplication of the test that produces them. No spec, `help.md`, or user documentation describes the predicate.
