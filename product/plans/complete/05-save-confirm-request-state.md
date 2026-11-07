# Generalize `useSaveConfirm` into the guard's request state

**Complexity: 4/10** — one hook rewritten around a two-mode request union with a single generation/pending guard, plus the close guard's rename to the new operations. Correctness depends on pure functional updates that survive StrictMode and stale selections, and on handing subplan `06` exact field and operation names; the close path must stay behaviorally identical.

## Goal

Rewrite `web/src/unsaved-work/useSaveConfirm.ts` so it owns a request that is one of:

- a close of one tab label;
- a quit walk with the set of labels already answered, the label currently being asked about, and the carried `SaveChoice`;
- `null` when no dialog is open.

Name the union `SaveConfirmRequest` and export it as a type from the hook module. `06-quit-walk-guard` may import it with `import type` when typing `useQuitWalk`'s request parameter; do not define a second alias anywhere.

The hook keeps one generation counter and one pending flag for both kinds. Opening a request, moving the walk to its next label, and dismissing each bump the generation, so a save that settles after Cancel, after the walk moved on, or after unmount cannot act. `labelRef` continues to mean "the label being asked about" for both kinds, so the close handlers in `CloseSaveGuard` read it unchanged.

The hook returns exactly `request`, `saveConfirmOpen`, `saving`, `labelRef`, `startSave`, `isCurrentAttempt`, `openClose`, `openQuitWalk`, `advanceQuitWalk`, `dismiss`, and `select`. `06` consumes those names; do not rename them or nest them under a second object.

## Dependencies and ordering

This subplan depends on `01-move-unsaved-work-modules` for the moved hook and on `04-save-changes-dialog-variants` for the exported `SaveChoice` type at `web/src/unsaved-work/SaveChangesDialog.tsx:5` (`export type SaveChoice = 'save' | 'discard' | 'cancel';`). It does not depend on `02-tab-full-name` or `03-save-walk-pure-module`.

Subplan `06-quit-walk-guard` consumes the new request state and must land after this subplan. `07-focus-suppression-during-walk` and `08-quit-entry-and-cmd-w` do not touch this hook. The close path continues to work at the end of this subplan; the walk is not reachable until `06` and `08`. Land `05` with the close path behaviorally identical, so `06` can change only the walk branch.

## Design decisions

- The request type is a discriminated union named `SaveConfirmRequest`:
  - a close request carries `kind: 'close'` and `label: string`;
  - a quit request carries `kind: 'quit'`, `label: string`, `answered: ReadonlySet<string>`, and `selection: SaveChoice`.
- The state is `SaveConfirmRequest | null`; `null` means no dialog. Use `null`, not `undefined`, so `saveConfirmOpen` is exactly `request !== null`.
- Export `SaveConfirmRequest` as a type from `useSaveConfirm.ts`. It is the only definition; `06` imports it with `import type` if it needs to name the request parameter, and does not define a parallel structural type.
- `labelRef` is updated whenever a request opens or advances. It holds the current label in both modes. `openClose`, `openQuitWalk`, and `advanceQuitWalk` set it; `dismiss` leaves it at the last label and does not clear it. The close handlers keep reading it as they do today.
- `saveConfirmOpen` remains available as a boolean derived from the request being present. The request itself is exposed so `06` can read `kind`, `label`, `answered`, and `selection`; `06` must narrow on `request.kind === 'quit'` before reading the walk-only fields.
- One `generationRef` and one `pendingRef` serve both kinds. The generation increments on:
  - opening a close request;
  - opening a quit walk;
  - advancing the walk to its next label;
  - dismissing either request;
  - unmounting.
  It does not increment on a selection change or when a save starts. A save attempt captures the current generation.
- All ref and flag mutations happen in the operation body, not inside a `setRequest` updater. React may invoke a state updater twice under `StrictMode` (`web/src/main.tsx:19` wraps the app in `React.StrictMode`), so an updater that increments the generation or clears `pendingRef` would run twice. Use the functional updater only to derive the next request purely from the previous one.
- `startSave()` returns `undefined` when no request is open or a save is already pending. Otherwise it sets the pending flag and `saving` true and returns the current label plus the current generation, in the same `{ label, generation }` shape the close handler consumes today. It does not bump the generation. Repeated `y`, `Enter`, or clicks while a save is pending therefore start nothing.
- `isCurrentAttempt(attempt)` compares the captured generation with the current one and reads nothing else. A false result means the attempt has been superseded by Cancel, an advance, another open, or unmount; its resolve and reject paths must do nothing.
- The operations are:
  - `openClose(label)` — bump the generation, clear pending and `saving`, set the close request, update `labelRef`.
  - `openQuitWalk(label)` — bump the generation, clear pending and `saving`, set the quit request with an empty answered set and the selection reset to `'save'`, update `labelRef`. This is the first tab of a walk.
  - `advanceQuitWalk(nextLabel)` — if the current request is not a quit request, do nothing. Otherwise bump the generation, clear pending and `saving`, update `labelRef` to `nextLabel`, and replace the quit request with a functional update: add the previous request's `label` to a new answered set, set `nextLabel` as current, and keep `previous.selection`. The previous label comes from `previous.label` inside the updater, not from `labelRef`, because `labelRef` has already moved to `nextLabel`. The selection comes from `previous.selection`, so a selection change made while a save is pending still carries to the next tab even if the handler that calls `advanceQuitWalk` was captured before that change.
  - `dismiss()` — bump the generation, clear pending and `saving`, set the request to `null`. It leaves `labelRef` unchanged.
  - `select(choice)` — in a quit request only, replace the request's selection with `choice` through a functional update; do not bump the generation, do not touch `pendingRef` or `saving`, do not change `labelRef`, and do not disturb a pending save. In a close request or with no request, do nothing.
- `advanceQuitWalk` does not add `nextLabel` to the answered set. The current label is answered; the next label is being asked now. It also does not add anything when called on a close request or with no request.
- The answered set is a new set on each advance; the previous set is not mutated. The union field is `ReadonlySet<string>`; the operation copies it into a new `Set`, adds the previous label, and stores the result. This keeps React state updates predictable and lets the walk module receive a snapshot of what has been answered.
- The close-mode request has no selection field. The close dialog keeps its uncontrolled local selection from `SaveChangesDialog`; only the quit branch is controlled.
- The hook does not decide when the walk ends. When there is no next label, the caller dismisses and quits; when a save fails, the caller dismisses and focuses. The hook only provides the state and generation protection.
- The hook does not render anything. Its only project import is the `SaveChoice` type from `SaveChangesDialog.tsx`, imported with `import type` and the extensionless `./SaveChangesDialog` specifier that web sources use; it does not import the walk module, the guard, the client, or render a dialog. It is a feature-local hook over React state and refs.
- The rewrite is expected near 100–120 effective lines in `useSaveConfirm.ts`, well under the 200-line `max-lines` limit (`eslint.config.mjs:62`), so no extraction is planned. If implementation pushes the file past 180 effective lines, split the pure request-transition helper into `web/src/unsaved-work/save-request.ts` and keep the hook as the React wrapper; do not compact the hook. The new test file is exempt from `max-lines` (`eslint.config.mjs:114-118`), so keep its cases together.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Current request state | `web/src/unsaved-work/useSaveConfirm.ts` (`generationRef` at `:9`, `pendingRef` at `:10`, `startSave` at `:30-35`, `isCurrentAttempt` at `:37-38`) | Rewritten in place. The generation, pending, `saving`, `labelRef`, `startSave`, and `isCurrentAttempt` ideas are kept. |
| Close handlers | `web/src/unsaved-work/CloseSaveGuard.tsx:50-80` (`onSave` begins at `:50`, `onCancel` ends at `:80`) | Adapted only to the new operation names and the close request branch. Their save, discard, cancel, focus, and close-by-label behavior does not change. |
| Three-choice type | `web/src/unsaved-work/SaveChangesDialog.tsx:5` (`export type SaveChoice = 'save' | 'discard' | 'cancel';`) | Imported as a type for the quit request's selection. |
| Existing close tests | `web/src/unsaved-work/CloseSaveGuard.test.tsx`, `web/src/unsaved-work/CloseSaveGuard.named-close.test.tsx` | They must pass with no behavior edits; they exercise the generation and pending behavior through the dialog. |
| Hook test style | `web/src/useCmdWRefs.test.ts:1` and `web/src/useFocusOnTabSwitch.test.ts:1` (both import `renderHook` from `@testing-library/react`) | `renderHook` with plain props, spies, `act` around state-setting operations, and `rerender` where a prop change is needed. |
| Test line-count exemption | `eslint.config.mjs:114-118` (`files: ['**/*.test.ts', '**/*.test.tsx']`, `'max-lines': 'off'`) | The new hook test can stay in one suite however many cases it grows to. |

## Proposed changes

- Rewrite `web/src/unsaved-work/useSaveConfirm.ts` around the request union, the operations, and the generation/pending protection described above. Export the `SaveConfirmRequest` type and the exact return fields named in the Goal; keep the module's existing top comment about labels versus positions and update it to cover both request kinds.
- In `web/src/unsaved-work/CloseSaveGuard.tsx`, rename the destructured `openSaveConfirm` to `openClose` and `closeSaveConfirm` to `dismiss`; keep `saveConfirmOpen`, `labelRef`, `saving`, `startSave`, and `isCurrentAttempt`. Gate the dialog on `request?.kind === 'close'` in addition to the existing no-request early return, so a quit request is not rendered with close handlers; `06` replaces that gate with the two-branch render. Keep `targetHandle` reading `labelRef.current`, and keep the save, discard, cancel, focus, and `closeTab` behavior identical apart from the renames. Do not add walk rendering or walk handlers here; that is subplan `06`.
- Add `web/src/unsaved-work/useSaveConfirm.test.ts` for the request-state transitions that the existing close tests do not exercise directly.
- No other file changes in this subplan. `web/src/unsaved-work/SaveChangesDialog.tsx` is untouched; this subplan imports only its exported `SaveChoice` type. `dirtyTabs.ts`, `save-walk.ts`, `tab-name.ts`, `useUnsavedQuitGuard.ts`, `App.tsx`, and `AppMain.tsx` are not modified.

## Tests

In `web/src/unsaved-work/useSaveConfirm.test.ts`, using `renderHook` and wrapping every state-setting operation in `act`:

- Initially `request` is `null`, `saveConfirmOpen` is false, and `labelRef.current` is `''`.
- `openClose('alpha')` exposes a close request with `label: 'alpha'`, `saveConfirmOpen` true, and `labelRef.current === 'alpha'`; a second `openClose('beta')` replaces the label and leaves the same request kind.
- `openQuitWalk('alpha')` exposes a quit request with `label: 'alpha'`, an empty answered set, `selection: 'save'`, and `labelRef.current === 'alpha'`.
- `advanceQuitWalk('beta')` after a quit request on `alpha` adds `alpha` to the answered set, does not add `beta`, makes `beta` current, updates `labelRef`, and keeps the selection. Change the selection to `'discard'` and advance in one `act` using the `advanceQuitWalk` captured before the `select` call, so a stale closure over the old request fails the test.
- `advanceQuitWalk` does not mutate the previous answered set: capture the previous set while on `alpha`, advance to `beta`, then assert the captured set is still empty and the new request's set is a different object containing `alpha` and not `beta`.
- `advanceQuitWalk` on a close request, or with no request, leaves the request unchanged and does not invalidate a pending attempt.
- `select('cancel')` changes the quit request's selection without changing the generation: a save attempt started before the selection change is still current, `saving` remains true, a second `startSave()` still returns `undefined`, and `labelRef` is unchanged. `select` on a close request or with no request is a no-op.
- `startSave()` returns the current label and generation once; a second call while pending returns `undefined`; with no request open it returns `undefined`; after `advanceQuitWalk` clears pending, a new `startSave()` returns the next label with a new generation.
- `isCurrentAttempt` is true for the attempt just started, and false after `advanceQuitWalk`, after `dismiss`, and after a fresh `openClose` or `openQuitWalk`.
- `dismiss()` sets `request` to `null`, `saveConfirmOpen` to false, and `saving` to false.
- `openClose` after a quit request replaces the request kind and resets the answered set and selection, so stale walk state cannot leak into a later close.
- `openQuitWalk` after a cancelled walk starts with an empty answered set and `'save'` selected; a later quit starts over.
- Unmounting invalidates a pending attempt: start a save, capture the `isCurrentAttempt` function and the attempt before unmounting, unmount the hook, and assert the captured function now returns false. This mirrors the existing close-guard unmount cases at the hook level; the guard tests still cover the full path.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. The already-moved `CloseSaveGuard.test.tsx`, `CloseSaveGuard.named-close.test.tsx`, and `SaveChangesDialog.test.tsx` must pass with their existing assertions, proving the close path is unchanged. `check-diff` prints only a summary, so then run `npx vitest run --project client web/src/unsaved-work/useSaveConfirm.test.ts web/src/unsaved-work/CloseSaveGuard.test.tsx web/src/unsaved-work/CloseSaveGuard.named-close.test.tsx web/src/unsaved-work/SaveChangesDialog.test.tsx` and confirm all four suites pass. If `check-diff` prints `check:diff: no changes`, it verified nothing because the work is already committed; the explicit Vitest command is then the check.

Manual smoke check in the running app, because this subplan must not change the close path:

- Open an editor tab, make it dirty, and close it with its ×. The same "Do you want to save changes to this file?" three-button dialog appears. Save writes and closes the tab; Don't Save closes without writing; Escape dismisses and puts focus back in the tab.
- With a dirty tab open, type `quit`. The old one-button "You have unsaved changes. Close anyway?" dialog still appears, because `08` has not switched the entry point yet. Nothing in the walk is reachable or visible in this subplan.

## Out of scope

- No walk handlers, reveal, focus, close, or quit call.
- No `useQuitWalk` hook and no guard walk rendering; `06` owns both.
- No call site for `openQuitWalk`, `advanceQuitWalk`, or `select`; they exist only for `06` and the new hook test.
- No App or AppMain wiring; no change to `useUnsavedQuitGuard`, `useCmdWRefs`, `useCmdW`, or `UnsavedQuitDialog`.
- No change to `SaveChangesDialog.tsx`; its `title`, controlled-selection, and `className` surface belongs to `04`, and its default title, buttons, default selection, and focus behavior stay as they are.
- No change to `dirtyTabs`, the tab-name helper, or the walk module.
- No spec, help, or user-documentation edit; `09` owns the walk wording.
- No protocol or server change.
