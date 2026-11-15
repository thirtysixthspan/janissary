# Sidebar host selection

**Complexity: 3/10** — ~20 added lines, 1 file, 5 requirements, 7 test scenarios (p=4.56). One effect in the app shell, but it must select a docked navigator once per reveal without fighting the user's later choice of entry.

## Goal

Make the sidebar host show a docked file navigator whose restore hint carries `focus` under a revision it has not acted on. The hook records the revision so later broadcasts do not reselect the entry after the user picks another one. No focus code and no navigator feature import enter the app shell.

## Design decisions and dependencies

This subplan depends on `add-a-folder-icon-button-in-the-editor-tab-6-focus-hint-and-held-selection` for the focus flag on the payload and on `add-a-folder-icon-button-in-the-editor-tab-10-navigator-focus` for the focus behavior that runs once the selected entry mounts. The source plan is `./product/plans/complete/add-a-folder-icon-button-in-the-editor-tab.md`; this is its "Docked navigator visibility" decision.

- `useSidebarSelection` (`web/src/useSidebarSelection.ts:8`) gains one effect over its existing `entries`. `entries` is already filtered to this sidebar's side, docked and not hidden (`useSidebarSelection.ts:13`–`:14`, the `useMemo` ending in `entry.tab.dock === side && !entry.tab.hidden`), so the effect never sees a centre-strip or hidden navigator.
- The effect finds the first entry whose tab is a files view and whose restore hint carries `focus`. Use the shared guard `isFilesTabView` (`web/src/shared/tab/view-guards.ts:22`) as the predicate, exactly as `Sidebar.tsx:106` uses it before mounting a `FileNavigatorTab`. It narrows `files` to non-null, so the hint read is `entry.tab.files.restore?.focus === true`, and it guarantees the hook selects precisely the entries the sidebar would render as a navigator. `view-guards.ts` sits under `web/src/shared/`, so this is not a navigator feature import: the app shell still reads only `TabView` fields, preserving the one-way shared → feature → app dependency flow and the source plan's "the navigator feature imports nothing from the app shell" boundary.
- A `useRef` initialised to `null` holds the last revision this hook acted on. When the found revision differs from the ref, the effect calls `setSelectedLabel(entry.tab.label)` and records the revision. A later broadcast with the same revision, including one caused by the user selecting another entry, does not reselect. A new reveal has a new revision and selects again. The ref is per hook instance, so the two sidebars never share a revision, and it survives a navigator's undock and re-dock, so the same revision does not reselect after that remount — the same guarantee `10`'s per-label acknowledgement floor gives the focus hook.
- The server sends a fresh `tabs` array on every payload, so `entries` takes a new identity on every broadcast and the effect re-runs often. That is expected: the revision ref, not the effect's run frequency, is what prevents a reselect. The dependency array is `[entries]`; do not add `selectedLabel` (the effect never reads it, and depending on it would let a user selection retrigger the reveal), and `setSelectedLabel` is a stable `useState` setter, so `react-hooks/exhaustive-deps` — error-level at `eslint.config.mjs:185` — is satisfied without a suppression comment.
- If more than one docked navigator carries a focus hint in the same broadcast, the first in entry order wins. Entry order is the server's tab order, which is the order `Sidebar` shows in its strip. The reveal path normally produces one at a time, so this is a deterministic tie-break rather than a user-facing rule.
- The effect must run after the existing newly-docked effect (`useSidebarSelection.ts:18`) and the `focusView` effect (`:24`), which both set the selected label. Declare it directly after the `focusView` effect and before the `entriesRef` block at `:29`; do not reorder the existing effects. Third position makes its selection the last write in a commit where a reveal and a fresh dock land together, which is what the reveal needs.
- A navigator that is already the selected entry is left as it is; `setSelectedLabel` with the same label changes nothing visible. A navigator docked on the other side is handled by that side's hook instance.
- The focus flag stays on the payload until `10` acknowledges it and `07` clears it. This effect never clears anything and never sends an acknowledgement.
- `07` is not a prerequisite for this subplan: it only removes the flag, and the same revision still cannot reselect while the flag is present. Land after `06` and `10`; `07` precedes `10` because `10` needs the acknowledgement RPC, so the practical order comes from `10`'s dependency, not from this subplan.
- `Sidebar.tsx` does not change. It already mounts `FileNavigatorTab` only for the sidebar's current entry and passes `autoFocus={false}` (`Sidebar.tsx:106` to `:108`). Selecting the entry causes the mount, and `10`'s hook focuses the tree from the hint at mount.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Sidebar entries | `web/src/useSidebarSelection.ts:13`–`:14` (`entries`) | Already filtered by side, dock and hidden. |
| Files-view predicate | `web/src/shared/tab/view-guards.ts:22` (`isFilesTabView`) | The entry predicate; the same one `Sidebar.tsx:106` uses to mount the tree. |
| Selected entry state | `useSidebarSelection.ts:11` (`selectedLabel`), `:67` (returned `setSelectedLabel`) | The effect's only write. |
| Existing selection effects | `useSidebarSelection.ts:18` (newly docked), `:24` (`focusView`) | Ordering constraint; both stay. |
| Current-entry fallback | `useSidebarSelection.ts:49` (`selectedLabel` match, else `entries[0]`) | Why tests must assert `selectedLabel`, not `current`. |
| Docked navigator mount | `web/src/Sidebar.tsx:106` to `:108` | Mounts the current entry with `autoFocus={false}`; unchanged. |
| Focus flag | `src/tab/types.ts:174` (`FileNavigatorRestoreHint`, `focus` added by `06`) | The payload field the effect reads. |
| Focus behavior at mount | `web/src/file-navigator/useFileNavigatorRevealFocus.ts` (from `10`) | Runs once this effect's selection mounts the navigator. |
| Hook test precedent | `web/src/file-navigator/useFileNavigatorSelection.test.ts` (`renderHook`), `web/src/useLayoutState.test.tsx:1` (`renderHook` plus a fake client in the `web/src` root) | The test style for the new file. |

## Proposed changes

- Add the revision ref and the third effect to `useSidebarSelection.ts`, directly after the `focusView` effect and before `entriesRef`.
- Return nothing new; the selected entry already drives the sidebar's current entry, and `Sidebar.tsx:78` is unchanged.
- Do not change `Sidebar.tsx`, `App.tsx`, `sidebar-selection-coordinator.ts`, or any navigator module.
- Keep the hook under 200 lines: it is 68 raw lines today, this adds a ref and a short effect, and it lands near 80. Nothing is extracted, and `max-lines` is error-level at `eslint.config.mjs:62`.

## Tests

In a new `web/src/useSidebarSelection.test.ts` (the hook has no test file today), use `renderHook` the way `web/src/useLayoutState.test.tsx:1` does, and the bare fake client from `web/src/Sidebar.test.tsx:39` (`{ send: vi.fn() } as unknown as JanusClient`). Copy the `makeTab` fixture shape from `Sidebar.test.tsx:28`; it is not exported, so do not move or export it. Give every case its own client: `sidebarSelectionFor` keys a coordinator per client in a `WeakMap` (`web/src/sidebar-selection-coordinator.ts:30`), so a shared object would carry one case's published selection into the next.

Every case that expects a reveal to win must include a second docked entry ordered *before* the navigator — normally a `notifications` tab. Without it the newly-docked effect selects `entries[0]`, a files tab at index 0 is already selected, and the assertion passes even when the new effect does nothing. Assert `result.current.selectedLabel`; `result.current.current` is `selectedLabel`'s match or `entries[0]` (`useSidebarSelection.ts:49`), so it cannot distinguish a real selection from the fallback.

- A docked navigator with a focus hint under an unacted revision becomes the selected entry, with a docked `notifications` entry ordered first.
- A later broadcast with the same revision does not reselect after the user selects another entry: select the notifications entry through `result.current.setSelectedLabel` inside `act`, then rerender with a **new** `tabs` array carrying the same revision. The new array is required — `entries` is memoised on `tabs` (`useSidebarSelection.ts:13`), so rerendering with the same array skips the effect and proves nothing.
- A new revision selects the navigator again after that, and the sidebar follows it back.
- A `files` tab with no `dock` carrying a focus hint is ignored; keep a docked entry so there is a selection to compare against.
- A docked files tab with an ordinary hint (cursor, anchor, and selected but no `focus`), and one with no `restore` at all, leave the selection on the first docked entry.
- A hint on the other side is not considered: render with `side: 'right'` and a left-docked navigator carrying a focus hint while a right-docked notifications entry is present; `selectedLabel` stays on the right notifications entry, and `sidebarSelectionFor(client).isSelected(navigatorLabel)` stays false.
- A navigator focus hint arriving in the same broadcast as a newly docked `notifications` entry selects the navigator, not the new entry. This is the case that pins the effect's third-position ordering.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Run `npx vitest run --project client web/src/useSidebarSelection.test.ts web/src/Sidebar.test.tsx web/src/Sidebar.alert-selection.test.tsx` and confirm the unchanged `focusView` and coordinator-selection cases still pass. Read the diff to confirm the new effect is third, the predicate is `isFilesTabView`, no navigator module is imported, the dependency array is `[entries]`, and `Sidebar.tsx` is untouched.

Manual end-to-end check, once `08`'s editor reveal button is in place: dock a navigator on the left, select the left sidebar's notifications entry so the tree is not the current entry, then click the editor's folder button (or press Cmd+Shift+E). The sidebar must switch to the files entry, mount the tree, and show the revealed row as the cursor with keyboard focus in the tree from `10`. Select notifications again and let a few broadcasts arrive: the sidebar must stay on notifications, because that revision is already recorded. The full dock/undock/focus walk across all surfaces is `13-end-to-end-verification`'s.

## Out of scope

- No focus call, no acknowledgement, and no clear; `10` and `07` own those.
- No change to the newly-docked or `focusView` selection rules, the sidebar tab strip, or `autoFocus`.
- No change to `sidebar-selection-coordinator.ts`, the native-notification reveal route (`App.tsx:149`, `revealDocked`), or `SidebarSelectionCoordinator.select`.
- No selection of centre-strip navigators; the server's `setActiveTab` handles those.
- No change to the payload or the server.
