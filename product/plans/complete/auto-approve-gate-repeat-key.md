# Detect a stuck permission gate from the gate itself, not byte-for-byte screen equality

**Complexity: 2/10** — ~25 added lines in one production file, 3 requirements, 5 test scenarios, 2 new helper functions (p=4.25).

## Goal

Stop a redrawing terminal from defeating the auto-approve stuck guard. The guard must count repeats of the permission gate itself, so a spinner frame, clock, or task panel changing around a gate the keystroke cannot clear no longer resets the counter and prevents the stand-down notification.

## Root cause

`HarnessAutoApprover.onCapture` sets `repeat = capture.text === this.lastApprovedText`, keying the loop guard on the entire frame. A cosmetic redraw anywhere on screen makes the text differ, so `repeat` is false, `identicalApprovals` resets to 1, and the three-approval stand-down never fires. The approver then keeps sending keystrokes at a gate it cannot clear while the user keeps being asked to approve.

## Approach

Derive the repeat key from the lines that make up the detected gate rather than the whole capture. A small harness-aware predicate keeps only gate lines — the question, option rows and footer for claude; the title, options and confirm/cancel footer for codex; the bordered panel lines for opencode — and drops cosmetic chrome (spinner glyphs, clocks, task panels, status lines) wherever it appears. Two captures of the same gate with different chrome now produce the same key, so the existing `MAX_IDENTICAL_APPROVALS` counter and single stand-down notification behave exactly as before. A genuinely different gate still produces a different key, and a non-gate capture still resets everything.

The existing `detectPermissionGate` call remains the authority on whether the capture is a gate at all; the key is computed only on that branch. No detector, notification, capture-link, wire, or protocol behavior changes.

## Implementation steps

1. In `src/harness/auto-approve.ts`, add a harness-aware gate-line predicate and a `repeatKey(text, harnessName)` helper that filters the capture to gate lines and joins them. Reuse the existing `isYesDefaultLine`/`isNoOptionLine` helpers where they apply; add small predicates for the numbered option rows, claude's question/footer, codex's title/options/footer, and opencode's panel border.
2. Rename the `lastApprovedText` field to `lastApprovedGateKey` and set it from `repeatKey(capture.text, harnessName)` in `onCapture`; compute `repeat` from that key. Keep the notification, counter, and `isStuck` behavior byte-for-byte.
3. Add the regression test in `src/harness/auto-approve.test.ts`.
4. Update the stand-down paragraph in `product/specs/harness.md` to say the gate itself must be unchanged, not the whole screen.
5. Run `$janissary/scripts/run.mjs check-diff` after each step.

## Tests

In `src/harness/auto-approve.test.ts`, inside the `HarnessAutoApprover` block:

- Repeating the same gate with a cosmetic change elsewhere on screen (a task panel line whose count changes between captures) stands down after the same three approvals: three approvals and one stand-down, exactly as a byte-identical repeat.
- A codex overlay repeating with a changed non-gate chrome line also stands down after three approvals, confirming the harness-aware key.
- Keep all existing tests unchanged, in particular the byte-identical stand-down, the "screen changes to a new gate" reset, the non-gate reset, and the `isStuck` tests.

## Out of scope

- Changing the gate detectors, the approval keystroke, notification text, or capture-link behavior.
- Changing capture throttling in `HarnessScreenReader` or busy/ready tracking.
- General screen compression such as `src/monitor/harness-feed.ts`; only the gate's own lines form the key.
- Help and user-documentation changes: neither describes the repeat counter, so nothing there becomes inaccurate.
