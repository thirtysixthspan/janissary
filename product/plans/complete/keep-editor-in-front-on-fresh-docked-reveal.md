# Keep the editor in front when a reveal opens a fresh docked navigator

**Complexity: 2/10** — ~1 added line in 1 production file, 3 requirements, 4 test scenarios (p=3.60).

## Goal

`revealEditorFile` ends by activating the navigator only when it carries no dock. On a fresh reveal, `openOrRetargetLocalAt` opens and activates the navigator, then `registerOpenedTab` docks it left. `applyDock` sees that the tab being docked is the active one and hands activation to `nearestNonDocked`, which can be an unrelated tab. The reveal's final check then sees a docked navigator and does nothing, so that unrelated tab stays in front while the editor is hidden. This contradicts the spec's statement that a fresh navigator opens docked left so the editor stays visible, and it is the defect the end-to-end walk observed as a `janus` tab taking over while an editor of `src/file-navigator/remote/file-cache.ts` went hidden.

The fix makes the final activation dock-aware in both directions: an undocked navigator is brought to the front as today, while a docked navigator leaves the reveal's source editor active.

## Design decisions

- **Compute the index once.** The navigator's index is needed for both the dock lookup and the undocked activation, so keep `const index = port.managers.tab.findIndex(label)` and branch on it.
- **Activate the editor only on the docked branch.** The editor is the tab the reveal was invoked from and the one the spec keeps visible in the centre. On the undocked branch the navigator becomes the active tab exactly as before, including when `findIndex` returns `-1`, where `setActiveTab(-1)` is already a no-op.
- **Leave every other step alone.** Expansion, the restore hint, the rebuild, and the dock lookup stay unconditional; only the final activation branches. In particular, `registerOpenedTab` must keep calling `setDock`, because its `applyDock` hand-off is the existing fresh-open behavior and the shell and harness button path depends on the same helper while activating its own source tab afterwards.
- **The docked editor activation is safe.** A retargeted docked navigator never changed activation, so its editor is already active and the call re-selects the same index. If the editor tab has closed by the time this line runs, `findIndex(editorLabel)` is `-1` and the activation is a no-op.

## Proposed changes

`src/file-navigator/reveal-editor.ts` — replace the final activation with:

```ts
const index = port.managers.tab.findIndex(label);
if (port.managers.tab.tabs[index]?.dock === undefined) port.managers.tab.setActiveTab(index);
else port.managers.tab.setActiveTab(port.managers.tab.findIndex(editorLabel));
```

`src/file-navigator/reveal-editor.test.ts` — make the fixture model the activation hand-off instead of only recording calls:

- Track an `activeTab` value. The fake `openFilesTab` makes the new tab active, the fake `setDock` marks the tab docked and, when it was active, moves activation to the first non-docked tab from its index the way `nearestNonDocked` does, and the fake `setActiveTab` records the call, sets `activeTab`, and undocks the named tab the way `revealTab` does.
- Add an `unrelatedFirst` fixture option that inserts a `janus` agent tab before the editor, so a navigator freshly opened at the end of the strip wraps to it when docked, reproducing the walk's order.
- Seed the pre-existing `files` tab only when the fixture has a navigator, so a fresh-open fixture starts with just the editor and the unrelated tab.
- Keep the centre-strip case: `setActiveTab` is called exactly once with the navigator's index.
- Change the docked case: `setActiveTab` is called exactly once with the editor's index, the navigator keeps `dock: 'left'`, and the expansion and hint are still written.
- Add a fresh-open case: with no navigator, the fake docks the newly opened `files-2` left and activation initially lands on `janus`; after the reveal, the editor's index is the last activation, `files-2` keeps its left dock, and the expansion and hint name the file.

## Tests

- `revealEditorFile` activates a centre-strip navigator that was already open (existing case).
- `revealEditorFile` leaves an already-docked navigator docked and activates the editor tab.
- `revealEditorFile` restores the editor after a fresh navigator's docking hands activation to an unrelated tab.
- The existing no-op cases (unknown label, non-editor label, blocked editor, missing root) keep asserting that no activation is recorded.
- `src/file-navigator/open.test.ts` keeps passing unchanged; the open-or-retarget helper is not touched.

## Out of scope

- `openOrRetargetLocalAt`, `registerOpenedTab`, `openFilesTab`, `applyDock`, `nearestNonDocked`, and the shell and harness metadata-row button path.
- `TabManager.setActiveTab`, `revealTab`, and their tests.
- Specs, help, and user documentation: `product/specs/editor-tab.md` already promises that a fresh navigator opens docked left so the editor stays visible, and this change restores that behavior rather than changing it.

## Verification

- `$janissary/scripts/run.mjs check-diff`
- `npx vitest run --project server src/file-navigator/reveal-editor.test.ts src/file-navigator/open.test.ts`
- Read the diff to confirm the only production change is the final activation branch.
- Rerun the walk's local-open step if an app start is cheap; otherwise leave the manual rerun to the orchestrator and state so in the report.
