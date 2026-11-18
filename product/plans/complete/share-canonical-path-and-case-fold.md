# Share one canonical path and case-fold rule across read, write, and patch

**Complexity: 4/10** — ~20 added production lines across 4 files, 5 behavioral requirements and 7 test scenarios, with one small shared module and two exported facts (p=5.00); a localized helper extraction, no new architecture.

## Goal

The three file subsystems derive the key for "the same file" in different ways. For the path spelling, `src/file-read/read.ts` `loadBytes` calls plain `realpathSync`, while `src/file-write/target.ts` and `src/file-patch/view.ts` `resolveCanonicalRoot` call `realpathSync.native`; on a case-insensitive volume these preserve different spellings. For the case-insensitive key, `src/file-patch/view.ts` `foldedPlace` and `planKey` use plain `.toLowerCase()`, while `src/file-read/policy.ts` `foldSegment` uses `.normalize('NFKC').toLowerCase()` and the secret-anchor checks use `.toLowerCase()` again. One file can therefore carry different keys in different subsystems, producing a duplicate file or a stale edit. Define both facts in one shared helper and use it at every call site. No command, flag, key binding, or user-visible syntax changes.

## Approach

Add `src/file-read/canonical.ts` as the single definition of both facts:

- `canonicalPath` is `realpathSync.native`, the spelling that preserves on-disk case. This is the spelling the write and patch subsystems already use, so readers move to it rather than the other way round.
- `foldCase(value)` is `.normalize('NFKC').toLowerCase()`, the stronger of the two current folds. It already recognizes Unicode aliases (for example the long-s aliases pinned in `policy.test.ts`) that plain lowercasing misses, so routing the patch keys and secret anchors through it only widens recognition in a safe direction.

`src/file-read/` is already the shared home for file policy — `policy.ts` lives there and is imported by write, patch, glob, and grep — so placing the helper beside it follows the existing boundary and creates no new module group or import cycle. All four consumers import the helper directly with the `.js` extension.

Keep each caller's local control flow intact: `view.ts` keeps its try/catch fallback and its `caseInsensitive` switch, `target.ts` keeps its error handling, and `read.ts` keeps its catch. Only the canonicalization and case-folding expressions are replaced. `src/file-patch/view-entry.ts` already calls `realpathSync.native` directly for the same canonical spelling; it needs no change and is left alone to keep the diff scoped.

## Implementation steps

1. Create `src/file-read/canonical.ts` exporting `canonicalPath = realpathSync.native` and `foldCase(value: string): string` that NFKC-normalizes then lowercases. Keep the helper comment-free except for a short note on why `.native` is the canonical spelling and why NFKC is the shared fold.
2. In `src/file-read/read.ts`, import `canonicalPath` from `./canonical.js` and use it in place of both `realpathSync` calls in `loadBytes`; drop `realpathSync` from the `node:fs` import. Run `$janissary/scripts/run.mjs check-diff`.
3. In `src/file-write/target.ts`, import `canonicalPath` from `../file-read/canonical.js`, delete the local `const canonicalPath = realpathSync.native`, and drop `realpathSync` from the `node:fs` import. All existing call sites keep working unchanged. Run `$janissary/scripts/run.mjs check-diff`.
4. In `src/file-patch/view.ts`, import `canonicalPath` and `foldCase` from `../file-read/canonical.js`. Replace `realpathSync.native(root)` in `resolveCanonicalRoot` with `canonicalPath(root)`, and replace the three `.toLowerCase()` folds in `foldedPlace`, `planKey`, and the `folded.set` inside `resolvePath` with `foldCase(...)`; drop the `realpathSync` import. Run `$janissary/scripts/run.mjs check-diff`.
5. In `src/file-read/policy.ts`, import `foldCase` from `./canonical.js`. Replace the four `.toLowerCase()` calls (the `SECRET_SEGMENT_RUNS` table, `isSecretPath`, `resolveHomeSecretAnchors`, and `isUnderAnchors`) with `foldCase(...)`, and delete the local `foldSegment` so `checkProtectedPath` calls `foldCase` directly. Leave `resolveExisting`'s `realpathSync` as-is: it resolves secret anchors for non-existent paths by walking parents, a separate concern from the read/write/patch key. Run `$janissary/scripts/run.mjs check-diff`.
6. Run the full `$janissary/scripts/run.mjs check-diff` once more with all changes in place.
7. Supporting test fix, no production code: the preceding commit that routed `filterPaths` through file glob's matcher left five hostile-timing cases in `src/file-grep/grep.test.ts` asserting a long backtrack that reaches the caller deadline. They fail on master because the shared matcher now refuses hostile patterns in an ordinary fast match. Adapt only that test block — result, fast completion, worker cleanup — mirroring the sibling `filter-worker.test.ts` adaptation, so the required diff-scoped suite is green. No grep production code changes.

## Tests

- Add `src/file-read/canonical.test.ts`:
  - `canonicalPath` returns the same spelling as `realpathSync.native` for a mixed-case existing file.
  - `foldCase` NFKC-folds and lowercases so a Unicode long-s alias of a protected segment produces the same key as its ASCII spelling.
  - Cross-module case: create a file with mixed-case on-disk spelling, then read it through `readWorkspaceLines`, resolve it through `resolveMutationTarget`, and open it through `createPatchView`. Assert the read returns its numbered lines, the write target's `realPath`, the patch place's `location`, and the patch content's `realPath` all equal the one native canonical spelling. This pins the decisive case-insensitive agreement that `view.test.ts` currently skips on volumes that ignore case.
- Existing suites must stay green with no new cases needed: `src/file-read/read.test.ts`, `src/file-read/policy.test.ts` (including the NFKC protected-path alias cases), `src/file-write/target.test.ts` (including the on-disk-spelling case), and `src/file-patch/view.test.ts` (including the case-folded pending-path cases).
- `src/file-grep/grep.test.ts` (existing): the five `hostile include and exclude budgets` cases are rewritten from caller-timeout assertions to fast-refusal assertions — a hostile include/exclude settles quickly with the expected matches, a responsive parent, and a cleanly exited worker. This repairs stale expectations left by the preceding `filterPaths` change; it does not change grep behavior.

## Out of scope

- Changing `src/file-patch/view-entry.ts`, `src/file-glob/*`, `src/file-grep/*`, or any other subsystem's path handling.
- Moving the helper into a new `src/file-operations/` namespace, or any import rewrite beyond the four consumers named above.
- Changing which callers treat a path as case-sensitive; the `caseInsensitive` switch and volume probe stay where they are.
- New commands, flags, key bindings, help pages, or public documentation. This is an internal key-consistency fix with no user-visible syntax change.
- Adding a migration for files already written under a stale non-canonical key.
