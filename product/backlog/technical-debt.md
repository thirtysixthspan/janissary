# technical-debt

## ready

* Split `src/tab/manager.ts` and retire its parallel per-label maps: the file is 451 lines and opens with `/* eslint-disable max-lines */`, suppressing the project's own 200-line guideline rather than following the guideline's stated remedy of extracting a cohesive module. It also still holds `cwd`, `busy`, `context`, and `queue` as separate `Map`/`Set` keyed by label — the exact "parallel maps keyed by label" pattern architecture principle 2 says to replace with state owned by the agent's own session object, now simply relocated from `Controller` to `TabManager`. Extract the split-pane/focus-selection logic (`repairSelections`, `focusedPane`, `recentLabel`, `moveTabToOtherPane`, `placeProfileTabs`) into its own module and move the per-label maps onto the tab object, then delete the suppression. Severity: **high**.

* Extract shared `basename`/`dirname` helpers for tree-relative paths in `web/src/`: thirteen files hand-roll `path.slice(path.lastIndexOf('/') + 1)` or the `lastIndexOf('/')` split behind it across seventeen sites — `FileNavigatorOverlays.tsx`, `useFileNavigatorMoveOperations.ts`, `file-navigator-drag.ts`, `file-navigator-rename.ts`, `file-navigator-new-file.ts`, `file-search-match.ts`, `fuzzy-match.ts`, `QuickOpen.tsx`, `FileNavigatorOpenerOverlay.tsx`, and `useFileNavigatorSelection.ts` among them — with no shared helper, so every site re-derives the `+ 1` offset and the no-slash edge case on its own and a fix to one leaves the other sixteen wrong. Add one small module (e.g. `web/src/rel-path.ts`) exporting `basename`/`dirname` and route every site through it. Severity: **medium** — deferred: the `remove-duplication.md` playbook blocks the named clone because removing it would edit more than three files.

* Add a colocated test for `web/src/useFileNavigatorMoveOperations.ts`: the hook is a 169-line conflict state machine — a three-variant `PendingConflict` union (`scalar`, `batch-move`, `history`), a `retry` function whose four branches each re-issue a different RPC, and single-versus-batch routing inside `requestMove` — and it is the largest of the four file-navigator hooks with no test beside it (`useFileNavigatorRename.ts`, `useFileNavigatorSearch.ts`, and `useFileNavigatorOpener.ts` are the others), while `useFileNavigatorSelection`, `useFileNavigatorDrag`, and the editor hooks all have one. Every path through `retry` moves or overwrites real files on disk, so picking the wrong branch is data loss rather than a rendering glitch. Cover each `PendingConflict` variant's request/retry/cancel cycle. Severity: **medium**.

## development

## deferred

## declined
