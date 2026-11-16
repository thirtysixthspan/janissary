# Repoint the ready web-search plan at the completed file-patch plan

**Complexity: 1/10** — a plan-only correction with no production code, two requirements (repoint both file-patch links, rewrite the completed extraction description) and no new units (p=2.35).

## Goal

`product/plans/ready/web-search.md` still points at `product/plans/ready/file-patch.md`, which this pull request moved to `product/plans/complete/file-patch.md`. Its remote-port bullet also says the web-search change must move the private `pasteRemote` and `createItem` bodies into `port-reads.ts` because `port.ts` sits at the `max-lines` limit. That extraction is already done: this pull request moved the private `pasteRemote` body into `remotePaste` in `src/file-navigator/remote/port-mapped.ts`, `remoteCreateItem` already existed, and `port.ts` passes `max-lines` now. A future web-search implementer who follows the plan either opens a missing path or repeats a completed extraction and risks a conflicting second helper.

## Approach

Correct only the stale plan text. Point both links at the completed file-patch plan, and describe the port extraction as already complete so the web-search change adds only its own `webSearch`/`web-search` operation. Leave every count instruction, including the "whichever lands second adds one" note, exactly as written.

## Implementation steps

1. In `product/plans/ready/web-search.md`, change both `product/plans/ready/file-patch.md` references to `product/plans/complete/file-patch.md`: the one in the `src/file-navigator/remote/port-reads.ts`, `port.ts` wiring bullet and the one in the native-command count note.
2. Rewrite that wiring bullet's extraction sentence. Remove the claim that `port.ts` is at the `max-lines` limit and that the same change must move `pasteRemote` and `createItem` into `port-reads.ts`. State that this pull request already moved the private `pasteRemote` body into `remotePaste` in `src/file-navigator/remote/port-mapped.ts` (not `port-reads.ts`), that `remoteCreateItem` already existed, and that `port.ts` is now below its `max-lines` limit, so the web-search change skips the extraction and adds only `remoteWebSearch`/`webSearch` and its `web-search` operation.
3. Leave the tell quantifier, the count note's "whichever lands second adds one" logic, and all other plan text unchanged.

## Tests

No runtime behavior changes and no tests to add. Verify by reading both corrected references in `product/plans/ready/web-search.md` and confirming `src/file-navigator/remote/port-mapped.ts` exports `remotePaste` and `remoteCreateItem` while `src/file-navigator/remote/port.ts` lints clean under `max-lines`. Run `$janissary/scripts/run.mjs check-diff` after the edit.

## Spec and documentation

No functional spec or user documentation changes: `web-search.md` is an implementation plan the fix corrects, and no spec describes plan file locations.

## Out of scope

- Editing `port.ts`, `port-mapped.ts`, or any production code.
- Changing the web-search plan's feature scope, design decisions, or test list.
- Updating the counts in the plan's tell and native-command sections beyond their file-patch path reference.
