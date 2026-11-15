# Navigator focus and acknowledgement

**Complexity: 3/10** — ~45 added lines, 1 existing file, 4 requirements, 7 test scenarios, 1 new unit (p=4.62). One new hook and one call site, but it must focus at mount as well as on a hint change and report each revision exactly once.

## Goal

Give the navigator tree keyboard focus as soon as a focus hint arrives, including when the navigator has just mounted because a sidebar selected it. When the held selection is applied or dropped, report the hint once through `fileNavigatorRevealApplied` so the server can clear the flag. An ordinary hint does not focus and is not reported.

## Design decisions and dependencies

This subplan depends on `add-a-folder-icon-button-in-the-editor-tab-6-focus-hint-and-held-selection` for the `focusHint` value and on `add-a-folder-icon-button-in-the-editor-tab-7-reveal-applied-acknowledgement` for the acknowledgement RPC. `11-sidebar-host-selection` selects the docked entry that causes the mount, and `13-end-to-end-verification` observes the dock/undock focus outcome. It therefore lands after `06` and `07` and before `11` and `13`. It cannot land any earlier: without `07`'s member in `FileNavigatorRpcCall` the typed `client.send` call fails typecheck, and `selection.focusHint` does not exist before `06`. There is one landing step — the new file plus the call site — because a hook that focuses but cannot acknowledge is not a green intermediate state. The source plan is `./product/plans/complete/add-a-folder-icon-button-in-the-editor-tab.md`; this is its "Focus and acknowledge" bullet and the sidebar mount note.

- A new hook `web/src/file-navigator/useFileNavigatorRevealFocus.ts` takes, in positional order, the client, the navigator's label, the `focusHint` value returned by `useFileNavigatorSelection`, and the tree container ref; it returns nothing. Positional arguments match the directory's other hooks (`useFileNavigatorSelection.ts:17`, `useFileNavigatorDrag`). Type `focusHint` as `ReturnType<typeof useFileNavigatorSelection>['focusHint']` with a type-only import of the hook, the way `FileNavigatorRows.tsx:15` types the whole selection surface; do not add a second exported type for it. The ref is `React.RefObject<HTMLDivElement | null>`, matching `FileNavigatorTab.tsx:31`. The client is `JanusClient` from `../shared/ws/ws`. The hook takes no `files.restore` and no `focus` boolean: `06` owns the decision that a hint is a focus hint, and the hook acts only on its recorded outcome.
- One focus effect, keyed on `focusHint?.revision` alone. When a defined revision is above the acknowledged floor it calls `containerRef.current?.focus()`, the same call `FileNavigatorTab.tsx:177` passes to the overlays as `focusTree`. Keying on the revision alone means `06`'s outcome change from `pending` to `applied` does not focus a second time: if the row arrives while the user has tabbed into the navigator's header, focus must not be yanked back to the tree. A hint first seen already `dropped` still focuses once, which is a no-op because that drop means the user is already in the tree. Name `focusHint?.revision` as the effect dependency so `react-hooks/exhaustive-deps` is satisfied without a disable comment.
- Mount is the case that needs the effect, not `autoFocus`. `06` returns `focusHint` as `undefined` for the one render before it records the outcome, so a navigator mounted with a hint focuses one commit later, when the value first appears. That is still before the user can act, and it works for the sidebar's mount, which passes `autoFocus={false}` (`web/src/Sidebar.tsx:108`). Do not read `files.restore` directly, and do not switch the mount path to `autoFocus`.
- The existing `autoFocus` effect at `FileNavigatorTab.tsx:52` stays exactly as it is. A centre-mounted navigator with a hint is focused by both it and the new hook; both call focus on the same container, so the duplicate is harmless and needs no dedupe.
- It does not focus a navigator that is not mounted. The hook only runs inside a mounted `FileNavigatorTab`, and the sidebar mounts only its current entry (`Sidebar.tsx:106`). No app-shell code calls focus.
- The row is scrolled into view by the tree's existing cursor effect (`FileNavigatorTab.tsx:56`, the effect that queries `[data-path="..."]` and calls `scrollIntoView({ block: 'nearest' })`), because the applied selection changes `selection.cursor`. No new scroll code is added here.
- One acknowledgement effect, keyed on `focusHint` itself. When the value is defined, its outcome is `applied` or `dropped`, and its revision is above the floor, it records that revision in the floor map and then sends `{ method: 'fileNavigatorRevealApplied', params: { label, revision } }`. The label is the navigator tab's label, not the editor's, matching `07`'s decoder. Record before sending, so StrictMode's double effect invocation (`web/src/main.tsx:19`) and any re-render before the server clears `focus` cannot send twice. While the outcome is `pending` it sends nothing. The send is fire-and-forget: `send` returns `void` (`web/src/shared/ws/ws.ts:173`), so there is no `request`, await, error path, notification, or retry to add; the cleared hint arrives through `07`'s rebuild broadcast and makes `focusHint` `undefined`.
- An acknowledged revision is remembered in a module-level map from navigator label to the highest acknowledged revision, declared in the hook file, never exported, and never cleared on unmount. Before focusing or sending, the hook ignores a revision at or below that label's floor. The map is what makes a remount deterministic: docking or undocking remounts the tree with the same hint, and the server's clear broadcast may not have landed yet. Revisions come from one global monotonic counter (`nextRestoreRevision` in `src/file-navigator/restore.ts:30`), so a newer reveal always has a higher number and still focuses.
- Each label's entry is a single number, so the map grows with the number of navigator labels, never with the number of reveals, and is not cleared on unmount because the whole point is to survive a remount. No server state is mirrored beyond the revision number. Do not export a reset helper for tests; isolated tests use distinct labels instead (see Tests).
- `focusHint` is `undefined` for an ordinary hint, so an ordinary `files` restore does not focus and does not send an acknowledgement. That preserves today's behavior for every non-reveal route.
- `FileNavigatorTab.tsx` (181 raw lines) gains one import and one hook call and nothing else. Call it after both `useFileNavigatorSelection` (`:29`) and `containerRef` (`:31`) exist, before the existing `autoFocus` effect (`:52`), passing `client`, `label`, `selection.focusHint`, and `containerRef`. Two added lines leave the file under the 200-line `max-lines` limit, so nothing is extracted.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Selection hook outcome | `web/src/file-navigator/useFileNavigatorSelection.ts` (`focusHint`, from `06`) | Drives focus and the acknowledgement; never reconstructed here. |
| Tree container and `focusTree` | `web/src/file-navigator/FileNavigatorTab.tsx:31` (`containerRef`), `:177` (`focusTree`) | The focus target and the exact `focus()` call, reused. |
| Existing mount focus | `FileNavigatorTab.tsx:52` (`if (autoFocus) containerRef.current?.focus()`) | Left untouched; the hook covers the `autoFocus={false}` mount. |
| Scroll-to-cursor effect | `FileNavigatorTab.tsx:56` | Scrolls the revealed row; no new code. |
| Sidebar mount and `autoFocus` | `web/src/Sidebar.tsx:106` (mounts the current entry), `:108` (`autoFocus={false}`) | The mount case the hook must handle. |
| Acknowledgement RPC and clear | `src/protocol/file-navigator.ts:54` (`FileNavigatorRpcCall`), `src/file-navigator/reveal-editor.ts` (`clearRevealFocus`, from `07`) | The request the hook sends and the clear it triggers. |
| Fire-and-forget send | `web/src/shared/ws/ws.ts:173` (`send(call): void`) | Nothing is awaited. |
| Restore revision counter | `src/file-navigator/restore.ts:30` (`nextRestoreRevision`) | Why the per-label revision floor is safe. |
| Navigator tab tests | `web/src/file-navigator/FileNavigatorTab.test.tsx:37` (`makeFiles`), `:723` (the `autoFocus` focus-spy test) | New cases beside the existing render and focus tests. |

## Proposed changes

- Create `web/src/file-navigator/useFileNavigatorRevealFocus.ts` with the inputs, the revision-keyed focus effect, the outcome-keyed acknowledgement effect, and the module-level acknowledged-revision floor described above.
- Call it once in `FileNavigatorTab.tsx`, at the position named above. Do not add a prop, an app-shell callback, or a change to `useFileNavigatorSelection`.
- Add no scroll, no `autoFocus` change, and no change to the existing selection effects.
- Keep the hook well under 200 lines; it needs no extraction.

## Tests

In `web/src/file-navigator/FileNavigatorTab.test.tsx`, using `makeFiles` (`:37`) and the `{ send: vi.fn() }` fake client, with the focus spy pattern from the `autoFocus` test (`:723`). Assert acknowledgement calls by filtering `client.send.mock.calls` to `method === 'fileNavigatorRevealApplied'`, so an unrelated send cannot make a case brittle. Give every case its own navigator label, because the floor is module-level and shared across the file; never reuse a label between cases and do not add a reset export.

- A sidebar-style mount — `autoFocus={false}` (the exact `Sidebar.tsx:108` prop) plus a hint carrying `focus` — focuses the tree and sends `fileNavigatorRevealApplied` once with that label and revision. The `autoFocus={false}` is what proves the hook did the focusing; with the default `true` the existing effect at `:52` would mask a broken hook.
- A focus hint whose row arrives in a later payload focuses the tree immediately and sends the acknowledgement only when the selection lands, not while it is pending.
- An ordinary hint neither focuses the tree nor sends an acknowledgement.
- Remounting with a revision already acknowledged does not refocus and does not send again, even when the hint still carries `focus`.
- A later reveal with a higher revision focuses and acknowledges again, proving the floor is per revision and not per navigator forever.
- A hint dropped by a user cursor move before its row arrives sends the acknowledgement once and changes no selection.
- Two navigators with different labels acknowledge independently: the floor for one does not suppress the other's focus or acknowledgement.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Run `npx vitest run --project client web/src/file-navigator/FileNavigatorTab.test.tsx web/src/file-navigator/useFileNavigatorSelection.test.ts` and `npx vitest run --project server src/client-params/file-navigator.test.ts src/file-navigator/reveal-editor.test.ts`. Read the diff to confirm no `autoFocus` change, no new scroll code, no app-shell focus, and one acknowledgement path. There is no separate manual check at this stage; the dock/undock focus walk is `13-end-to-end-verification`'s.

## Out of scope

- No sidebar selection; `11` owns it.
- No server change; `07` owns the clear.
- No change to `focusHintStatus`, `useFileNavigatorSelection`, or the held-selection decision; `06` owns them.
- No change to the scroll effect or the overlay focus helper.
- No focus for an ordinary restore hint, a `files` command, or the search pop-up.
- No timeout, retry, or notification for a focus hint whose row never arrives; it stays pending, and the next reveal's revision supersedes it.
- No exported floor reset and no test-only hook; the floor stays module-private.
