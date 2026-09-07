# Scope save-before-close completion to one dialog attempt

**Complexity: 4/10.** A hook lifecycle change and small dialog integration.

## Goal

Prevent a cancelled or replaced save from closing a dirty tab, dismissing a later prompt, or stealing focus. Suppress repeated Save while an attempt is pending.

## Approach

Keep a generation and immediate pending guard in `web/src/SaveChangesDialog/useSaveConfirm.ts`. Opening, dismissing, or unmounting invalidates the current generation. Starting a save captures its label and generation. The app guard checks this identity on both success and failure before acting. Expose pending state to the dialog so its Save button and keyboard paths agree; Cancel and Discard remain available. Cancellation cannot undo a write already started.

## Implementation steps

1. Update `useSaveConfirm.ts`, `web/src/CloseSaveGuard.tsx`, and `SaveChangesDialog.tsx` with attempt identity, completion checks, pending state, and guard cleanup on unmount. Run check-diff.
2. Extend `CloseSaveGuard.test.tsx` and `SaveChangesDialog.test.tsx` with deferred-save and pending-input coverage. Run check-diff.
3. Update `product/specs/editor-tab.md` and the existing editor user documentation. Promote this plan, remove the resolved backlog entry, run check-diff, and ship through the merge workflow.

## Tests

Cover cancellation then completion, cancellation then a different prompt, direct prompt replacement, stale rejection, repeated button and keyboard Save, discard during save, and unmount before completion. Verify a new prompt can save while an invalidated attempt remains unresolved. Preserve insertion/removal, failure-focus, plugin, and dialog keyboard tests.

Use an explicit Promise constructor for deferred client tests because the client targets ES2023. Add a narrow lint suppression comment explaining that compatibility requirement.

## Out of scope

Cancelling server writes, changing the close-tab wire contract, editor conflict semantics, and app state restructuring.
