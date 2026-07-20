# Harness tabs badge unread when hidden and the harness finishes work

**Complexity: 2/10** — the unread-badge machinery (`TabManager.markUnread`/`markUnreadTab`) is already fully generic across tab types and already used for the harness "waiting on user input" case in the same file; this adds one more call site for the "completed work" case.

## Goal

`busyStatusHandler` (`src/harness/busy-status.ts`) already badges a hidden harness tab unread when a permission gate appears and nothing will auto-approve it (`apply`'s first branch, line 36: `if (!approver || approver.isStuck) managers.tab.markUnread(label);`) — the "waiting on user input" half of the issue is already implemented. The "completed work" half is not: the busy→ready transition (the debounced `pendingReady` branch, lines 44-46) clears the busy flag but never calls `markUnread`, so a hidden harness tab that finishes generating gives no unread signal at all — only a tab that hits a permission gate does.

## Approach

Add a single `managers.tab.markUnread(label)` call at the exact point the busy→ready transition commits (the `if (pendingReady) managers.tab.deleteBusy(label);` branch). `markUnread` → `markUnreadTab` (`src/tab/transcript-commands.ts:9-13`) already no-ops for a docked or active (visible) tab, so "hidden" is handled for free — no new condition needed here, matching how the existing permission-gate call site works. The outer handler wrapper already emits `state: dirty` whenever `dotSnapshot` (busy flag + unread flag) changes (`busy-status.ts:48-52`), so no separate dirty-push is needed either — reuses the existing before/after snapshot diffing verbatim.

## Implementation steps

1. In `src/harness/busy-status.ts`'s `apply` function, change:
   ```ts
   if (pendingReady) managers.tab.deleteBusy(label);
   else pendingReady = true;
   ```
   to:
   ```ts
   if (pendingReady) { managers.tab.deleteBusy(label); managers.tab.markUnread(label); }
   else pendingReady = true;
   ```
2. Update the function's leading comment block (lines 17-25) to note that a busy→ready commit also badges the tab unread, not just a permission gate.
3. Run `./scripts/run.mjs check-diff`.

## Tests

Add to `src/harness/busy-status.test.ts`, in the `describe('busyStatusHandler state push', ...)` block (using the existing `makeStateful` helper, which already wires `markUnread` to flip `tabs[0].hasUnread`):

- `'badges the tab unread when the debounced ready transition commits'` — send a busy capture, then two ready captures (mirroring the existing `'pushes state when the debounced ready transition commits'` test), and assert `tabs[0].hasUnread` is `true` after the second ready capture (not after the first, since that's still `pendingReady`, not yet committed).
- In the `describe('busyStatusHandler debounce', ...)` block (using `make`, whose fake `tab.markUnread` is a `vi.fn()`): `'calls markUnread only once the ready transition commits, not on the first transient ready'` — busy → ready → assert `tab.markUnread` not yet called → ready again → assert `tab.markUnread` called once.

Since the busy→ready commit path is shared code across all three harnesses, this also affects `src/harness/manager.test.ts`'s existing `'drives opencode busy/ready from screen text, with no badge on its permission prompt'` test — opencode has no distinct gate detection, so its permission prompt reads as an ordinary busy→ready transition and now badges unread too, same as any other completion. Update that test (rename to reflect the new expectation) to assert `markUnread` **is** called once the transition commits, rather than asserting it is never called — this isn't scope creep, it's the same shared branch this fix touches, exercised through a different harness.

## Spec updates

`product/specs/harness.md`, the paragraph at line ~256-258 ("Status changes show in the tab strip...") and/or the permission-prompt paragraph at line ~260-265: add a sentence noting a hidden (backgrounded) harness tab is also badged unread when a working→idle transition commits — i.e. when it finishes its current run — not only when it hits an unhandled permission prompt.

## Out of scope

- Any change to the permission-gate unread call site (already correct, already the case this fix mirrors).
- Any change to `markUnreadTab`'s hidden/docked/active detection — reused as-is.
- Any change to the busy→ready debounce itself (still two consecutive ready captures before committing) — only the commit branch gains the new call.

## Verification

- Run `./scripts/run.mjs check-diff` after the change and after the tests.
- Manual check: open a harness tab, give it a prompt, switch focus to a different tab while it's generating, and wait for it to finish. Confirm the harness tab picks up the unread badge in the strip once it goes idle, the same way it already does when it hits an unhandled permission prompt.
