# Edit command already appends to the transcript before opening the editor tab

**Complexity: 1/10** — no code change; the described behavior is already implemented and tested.
The only action is removing the stale entry from `docs/small-issues.md`.

## Goal

Confirm whether "edit command should go in the transcript before opening the editor tab" is
still an open bug, and either fix it or remove the stale entry.

## Background

`src/commands/edit.ts` `run()` already calls `managers.tab.append(tab.label, { input: command,
output: '' })` **before** `managers.openFile.edit(...)` (the only call path that leads to
`openEditorTab`). Both `TabManager.append()` and `TabManager.openEditorTab()`
(`src/tab-manager.ts` lines 208-219 and 304-309) emit their `messageBus` events synchronously
in call order, so the client always receives the transcript-append message before the
tab-open message.

`src/commands/edit.test.ts` already has two tests asserting this exact ordering:
"appends the command to the transcript before opening the editor tab" and "appends before
edit is called" (which asserts `callOrder` is `['append', 'edit']`).

`git log` shows this was fixed by PR #69 ("Append edit command to transcript before opening
editor tab", commit `0835a91`, 2026-07-03) — before the small-issues.md entry was written (or
the entry was never removed after that fix landed). The issue in the list is stale.

## Approach

No source, test, or spec change is needed — the behavior, its test coverage, and its spec
documentation (`spec/editor-tab.md`: "a transcript entry for the command appears in the
originating tab before the editor tab opens and takes focus") are all already correct and in
place. Remove the stale line from `docs/small-issues.md`.

## Implementation steps

None — verified via `src/commands/edit.ts`, `src/tab-manager.ts`, `src/commands/edit.test.ts`,
and `git log` as described above.

## Tests

None added — existing coverage in `src/commands/edit.test.ts` already asserts the ordering.

## Out of scope

Any change to `edit.ts`, `tab-manager.ts`, or their tests, since none is needed.

## Verification

`./scripts/run.mjs check-diff` passes clean (no source changes). Confirmed by reading
`src/commands/edit.ts` and `src/commands/edit.test.ts` and by `git log` showing the prior fix.
