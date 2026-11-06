# Generalize `useSaveConfirm` into the guard's request state

**Complexity: 4/10** — turns a single-label dialog state into a two-mode request state with one generation counter and pending guard, and carries the selection across walk steps. The close path must stay behaviorally identical while the new quit mode is introduced.

## Goal

Rewrite `web/src/unsaved-work/useSaveConfirm.ts` so it owns a request that is either:

- a close of one tab label, or
- a quit walk with the set of labels already answered, the label currently being asked about, and the carried `SaveChoice`.

The hook keeps one generation counter and one pending flag for both kinds. Opening a request, moving the walk to its next label, and dismissing each bump the generation, so a save that settles after Cancel, after the walk moved on, or after unmount cannot act. `labelRef` continues to mean "the label being asked about" for both kinds, so the close handlers in `CloseSaveGuard` read it unchanged.

## Dependencies and ordering

This subplan depends on `01-move-unsaved-work-modules` for the moved hook and on `04-save-changes-dialog-variants` for the exported `SaveChoice` type. Subplan `06-quit-walk-guard` consumes the new request state. The close path continues to work at the end of this subplan; the walk is not reachable until `06` and `08`.

## Design decisions

- The request type is a discriminated union:
  - `{ kind: 'close'; label: string }`
  - `{ kind: 'quit'; label: string; answered: ReadonlySet<string>; selection: SaveChoice }`
  - absent when no dialog is open.
- `labelRef` is updated whenever a request opens or advances. It holds the current label in both modes. The close handlers keep reading it as they do today.
- `saveConfirmOpen` remains available as a boolean derived from the request being present. The request itself is exposed so `06` can read `kind`, `label`, `answered`, and `selection`.
- One `generationRef` and one `pendingRef` serve both kinds. The generation increments on:
  - opening a close request;
  - opening a quit walk;
  - advancing the walk to its next label;
  - dismissing either request;
  - unmounting.
  It does not increment on a selection change or when a save starts. A save attempt captures the current generation.
- `startSave()` keeps the current behavior: it returns `undefined` while a save is already pending; otherwise it sets the pending flag and `saving` true and returns the current label plus generation. Repeated `y`, `Enter`, or clicks while a save is pending therefore start nothing.
- `isCurrentAttempt(attempt)` compares the captured generation with the current one. A false result means the attempt has been superseded by Cancel, an advance, another open, or unmount; its resolve and reject paths must do nothing.
- The operations are:
  - `openClose(label)` — bump generation, clear pending and `saving`, set the close request, update `labelRef`.
  - `openQuitWalk(label)` — bump generation, clear pending and `saving`, set the quit request with an empty answered set and the selection reset to `'save'`, update `labelRef`. This is the first tab of a walk.
  - `advanceQuitWalk(nextLabel)` — bump generation, clear pending and `saving`, update `labelRef` to `nextLabel`, and replace the quit request with each other's data: add the previous label to the answered set, set `nextLabel` as current, and keep the selection as it stands at that moment. The selection must be read from the latest request state, not from a stale closure, so a selection change while a save is pending still carries to the next tab. Implement this with a functional state update over the previous request.
  - `dismiss()` — bump generation, clear pending and `saving`, clear the request.
  - `select(choice)` — in a quit request only, replace the request's selection with `choice`; do not bump the generation and do not disturb a pending save. In a close request or with no request, do nothing.
- `advanceQuitWalk` does not add `nextLabel` to the answered set. The current label is answered; the next label is being asked now.
- The answered set is a new set on each advance; the previous set is not mutated. This keeps React state updates predictable and lets the walk module receive a snapshot of what has been answered.
- The close-mode request has no selection field. The close dialog keeps its uncontrolled local selection from `SaveChangesDialog`; only the quit branch is controlled.
- The hook does not decide when the walk ends. When there is no next label, the caller dismisses and quits; when a save fails, the caller dismisses and focuses. The hook only provides the state and generation protection.
- The hook does not render anything. It imports only the `SaveChoice` type from `SaveChangesDialog.tsx`; it does not import the walk module, the guard, the client, or render a dialog. It is a feature-local hook over React state and refs.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Current request state | `web/src/unsaved-work/useSaveConfirm.ts` (after subplan `01`) | Rewritten in place. The generation, pending, `saving`, `labelRef`, `startSave`, and `isCurrentAttempt` ideas are kept. |
| Close handlers | `web/src/unsaved-work/CloseSaveGuard.tsx:50-80` (after subplan `01`) | Adapted only to the new operation names and the close request branch. Their save, discard, cancel, focus, and close-by-label behavior does not change. |
| Three-choice type | `web/src/unsaved-work/SaveChangesDialog.tsx` (`SaveChoice`, from subplan `04`) | Imported as a type for the quit request's selection. |
| Existing close tests | `web/src/unsaved-work/CloseSaveGuard.test.tsx`, `web/src/unsaved-work/CloseSaveGuard.named-close.test.tsx` | They must pass with no behavior edits; they exercise the generation and pending behavior through the dialog. |
| Hook test style | `web/src/useCmdWRefs.test.ts`, `web/src/useFocusOnTabSwitch.test.ts` | `renderHook` with plain props and spies. |

## Proposed changes

- Rewrite `web/src/unsaved-work/useSaveConfirm.ts` around the request union, the operations, and the generation/pending protection described above.
- In `web/src/unsaved-work/CloseSaveGuard.tsx`, adapt the close-only call site to the new names and read the close request branch. Do not add walk rendering or walk handlers here; that is subplan `06`.
- Add `web/src/unsaved-work/useSaveConfirm.test.ts` for the request-state transitions that the existing close tests do not exercise directly.

No other file changes in this subplan.

## Tests

In `web/src/unsaved-work/useSaveConfirm.test.ts`:

- `openClose('alpha')` exposes a close request with `label: 'alpha'`, `saveConfirmOpen` true, and `labelRef.current === 'alpha'`.
- `openQuitWalk('alpha')` exposes a quit request with `label: 'alpha'`, an empty answered set, and `selection: 'save'`.
- `advanceQuitWalk('beta')` after a quit request on `alpha` adds `alpha` to the answered set, makes `beta` current, updates `labelRef`, and keeps the selection. Change the selection to `'discard'` before advancing and assert the next request still has `'discard'`.
- `advanceQuitWalk` does not mutate the previous answered set; the previous set still contains only what it contained before.
- `select('cancel')` changes the quit request's selection without changing the generation: a save attempt started before the selection change is still current.
- `startSave()` returns the current label and generation once; a second call while pending returns `undefined`.
- `isCurrentAttempt` is true for the attempt just started, and false after `advanceQuitWalk`, after `dismiss`, and after a fresh `openClose` or `openQuitWalk`.
- `dismiss()` clears the request and `saveConfirmOpen`.
- `openClose` after a quit request replaces the request kind and resets the answered set/selection, so stale walk state cannot leak into a later close.
- `openQuitWalk` after a cancelled walk starts with an empty answered set and `'save'` selected; a later quit starts over.
- Unmounting invalidates a pending attempt: start a save, capture the `isCurrentAttempt` function and the attempt before unmounting, unmount the hook, and assert the captured function now returns false. This mirrors the existing close-guard unmount cases at the hook level; the guard tests still cover the full path.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. The moved `CloseSaveGuard.test.tsx`, `CloseSaveGuard.named-close.test.tsx`, and `SaveChangesDialog.test.tsx` must pass with their existing assertions, proving the close path is unchanged. There is no user-visible walk yet, so no manual walk check is possible in this subplan.

## Out of scope

- No walk handlers, reveal, focus, close, or quit call.
- No `useQuitWalk` hook and no guard walk rendering.
- No App or AppMain wiring.
- No change to the close dialog's title, buttons, or default selection.
- No change to `SaveChangesDialog`'s props beyond importing the `SaveChoice` type.
