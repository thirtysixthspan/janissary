# Keep a reveal from overriding a row pressed before its hint arrives

**Complexity: 5/10** — ~35 added production lines across 11 existing files, 6 behavioral requirements and 6 test scenarios (p=5.54); one small shared ordering module carries the only new abstraction.

## Goal

The editor's reveal button asks the server to select the edited file in a file navigator. On a slow local tree or a remote one, the rows and the focus hint arrive a moment later. A press on a row in that window is currently forgotten: the press's own selection is applied first, then the focus hint arrives, the effect resets `userMoved` for the new revision, and the hint's selection replaces what the user just chose. The tree also takes focus a second time.

The reveal must still win when the user asked for it after their last tree interaction. Only a tree press that happens after the reveal was requested may drop it. Re-rooting or retargeting the navigator keeps its existing drop behavior.

## Approach

### Order the request against tree presses

The two events are both client-side but cross a feature boundary: the editor sends the request, and the file navigator sees the press. Put one page-wide monotonic counter in the shared layer, where both features may import it:

```ts
// web/src/shared/interaction-order.ts
let lastOrder = 0;
export function nextInteractionOrder(): number { return ++lastOrder; }
```

A monotonic order is exact where a wall-clock timestamp is not: a press and a request in the same millisecond still compare correctly, and no clock resolution or clock agreement is involved. The counter is module-level because its whole job is to be shared by both features; it is not selection state and never leaves the page.

### Carry the request order on the wire hint

- `sendRevealInFileNavigator` in `web/src/editor/editor-file-commands.ts` stamps `requestOrder: nextInteractionOrder()` on the `revealInFileNavigator` params.
- `FileNavigatorRestoreHint` in `src/tab/types.ts` gains an optional `requestOrder?: number`, and the RPC params in `src/protocol/file-navigator.ts` gain the same optional field. `src/client-params/file-navigator.ts` accepts it only as an optional integer.
- The message dispatcher, controller, manager, and `revealEditorFile` pass it through. `revealEditorFile` writes it onto the focus hint beside `focus: true`. The server still computes and owns the cursor, anchor, and selected paths; the order is an opaque token it echoes back.
- Hints the server originates without a client request have no `requestOrder`, so the comparison below is skipped for them and their behavior is unchanged.

### Compare when the hint first becomes visible

`useFileNavigatorSelection` keeps a `lastInteractionOrder` ref. `dropPendingFocus` is already called by every selection transition and by the row's mouse-down handler, including the keep-selection path for a press on an already-selected row, so it is the single place to record the order before it does its existing pending-drop work.

When a focus hint revision is seen for the first time, the hook sets `userMoved` when `lastInteractionOrder > hint.requestOrder`. That feeds the existing `focusHintStatus`, which returns `dropped`; the hint is acknowledged and the user's selection is reconciled normally. A press from before the request has a lower order, so the reveal still applies. An interaction record is never reset by the new-revision effect; only the comparison decides.

`useFileNavigatorRevealFocus` stops focusing the tree for a hint whose outcome is `dropped`. The revision it focuses is computed only for a hint that is pending or applied, so a dropped hint neither moves focus nor becomes focusable when it settles from pending to applied later. A pending hint may still focus the tree once, which is the reveal's intended first action.

### Rejected alternative

Comparing wall-clock timestamps (`Date.now()`) sent on the wire. Two events in the same millisecond are ambiguous, and a conservative `>=` comparison would drop a legitimate reveal when the press came earlier in that same millisecond. A sequence has no such tie.

Using the hint's server revision order instead of a client interaction order. Revisions say nothing about when the user pressed a row; the defect is precisely that the server revision arrives after a client action it never saw.

## Implementation

1. Add `web/src/shared/interaction-order.ts` with `nextInteractionOrder()` and its colocated test.
2. Add the optional `requestOrder` to the reveal RPC params and the restore hint, and accept it in the params decoder.
3. Thread the order through `src/message/tabs.ts`, the controller adapter, `src/controller/file/navigator.ts`, `src/file-navigator/manager.ts`, and `src/file-navigator/reveal-editor.ts`.
4. Stamp the order in `sendRevealInFileNavigator`.
5. Record the order in `useFileNavigatorSelection`'s `dropPendingFocus` and compare it with a newly seen focus hint's `requestOrder` when setting `userMoved`.
6. Exclude dropped hints from `useFileNavigatorRevealFocus`'s focus step.
7. Run `$janissary/scripts/run.mjs check-diff` after each step.

## Tests

- `web/src/file-navigator/FileNavigatorTab.test.tsx`: the regression. Select a row, allocate a reveal request order, dispatch a `mousedown` with `button: 0` on that already-selected row, then rerender with the focus hint carrying the older `requestOrder` and rows that include its cursor row. Assert the earlier row stays selected, the revealed row is neither selected nor the cursor, and the focus spy gains no call when the hint lands.
- `web/src/file-navigator/FileNavigatorTab.test.tsx`: a reveal requested after the press still applies its selection and takes focus, so the fix does not over-drop.
- `web/src/file-navigator/useFileNavigatorSelection.test.ts`: the same two orderings at the hook level, plus the existing pending-drop and root-change cases unchanged.
- `web/src/shared/interaction-order.test.ts`: successive orders are strictly increasing.
- `src/file-navigator/reveal-editor.test.ts`: the hint carries the supplied request order, and omits the member when the server originates the reveal without one.
- `src/client-params/file-navigator.test.ts`: the decoder accepts an optional integer `requestOrder` and rejects a non-integer one.
- `web/src/editor/editor-file-commands.test.ts`: the reveal send includes a numeric request order.
- Update exact-payload expectations in `web/src/editor/EditorTab.test.tsx` for the added `requestOrder`.

## Spec

`product/specs/editor-tab.md` ("Revealing in the file navigator"): state that a press on any row after the reveal request — including one that is already selected — drops the pending selection, while a reveal requested after the user's last tree action still applies, and that a dropped reveal does not move focus. The existing text already promises the drop; this makes the "already selected" and request-ordering cases explicit.

## Docs

None: no help page or user-documentation page describes the reveal's pending-selection timing or focus behavior.

## Out of scope

- The reveal's server-side target resolution, root rules, and blocked states.
- The general selection transitions and row rendering.
- The PR description's restart-testing step, which is a separate backlog entry.
