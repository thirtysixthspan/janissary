# Gitsync commit message includes the synced filename

**Complexity: 3/10** — thread one string parameter from the save path through two functions to the commit call; no new modules.

## Goal

Every git-sync commit currently uses the same fixed message, `chore: planning` (`src/git-sync.ts:15`, `SYNC_COMMIT_MESSAGE`), regardless of which file was saved. After this fix, the commit message reflects the file that triggered the sync: `sync: <filename>`, e.g. `sync: bugs.md`.

## Approach

`saveSync()` currently takes no arguments. Its only caller, `syncAfterSave` in `src/editor/save.ts`, already knows which tab (and therefore which file) triggered the sync — `saveFile` calls `syncAfterSave(managers, tab.label)` and the tab's `editor.name` holds the saved file's basename at that point.

Thread the filename through:

- `src/editor/save.ts` — `syncAfterSave(managers, label)` looks up `tab.editor?.name` and passes it to `saveSync`.
- `src/git-sync.ts` — `saveSync(filename: string)` passes `filename` down to `commitIfChanged(dir, filename)`, which builds the message as `` `sync: ${filename}` `` instead of using the `SYNC_COMMIT_MESSAGE` constant. Drop the constant (no longer fixed) and update its doc comment.

## Implementation steps

1. `src/git-sync.ts`: change `saveSync(): Promise<SyncResult>` to `saveSync(filename: string): Promise<SyncResult>`, pass `filename` to `commitIfChanged`. Change `commitIfChanged(dir: string)` to `commitIfChanged(dir: string, filename: string)` and build the commit message inline as `` `sync: ${filename}` ``. Remove the now-unused `SYNC_COMMIT_MESSAGE` export.
2. `src/editor/save.ts`: change `syncAfterSave(managers, label)` to look up the tab's `editor?.name` before calling `saveSync`, passing it through. If `editor?.name` is somehow undefined (shouldn't happen for a synced tab, since `sync` is only ever set alongside a real `editor.name`), fall back to `label`.
3. Run `./scripts/run.mjs check-diff`.

## Tests

- `src/git-sync.test.ts`: update the existing "a save cycle commits with the fixed message..." test to pass a filename into `saveSync('bugs.md')` and assert the commit command contains `sync: bugs.md` instead of the removed constant. Add a second test asserting a different filename produces a different message, e.g. `saveSync('notes.md')` → commit command contains `sync: notes.md`.
- `src/editor/save.test.ts`: update the `saveSync` mock signature in `setupSynced` (and the "does not start a sync cycle" test) to accept a filename argument, and add/adjust an assertion that `syncAfterSave`'s `saveSync` call receives the saved file's basename.

## Out of scope

- Multi-file commit messages (e.g. when several synced files change in the same commit) — each save still triggers its own commit for the single file that was saved, matching current one-save-one-commit behavior.
