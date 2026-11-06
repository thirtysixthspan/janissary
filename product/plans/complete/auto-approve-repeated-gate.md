# Auto-approve a claude gate that comes straight back identical

**Complexity: 2/10** — a small change to the approver's loop guard in one class, plus a regression test, an update to an existing test, and a spec paragraph. No new architecture, and no wire or protocol change. The far-side approver for remote tabs is the same class.

## Root cause

`HarnessAutoApprover` treats any gate whose screen text matches the gate it last approved as a gate its keystroke failed to clear, and stands down at once. Screen captures are throttled to one read a second after output starts, so when a gate clears and an identical gate takes its place, the approver can see nothing between them. That happens when a subagent re-runs the same command, either straight away (`check-diff 2>&1 | tail -40`, re-asked one second after its approval) or as a retry (`Retry squash-merge`, re-asked 48 seconds later). The detector recognizes both screens as gates. The guard then refuses them.

## Correct behavior

An identical gate that reappears after an approval is approved again, up to three approvals in a row. Only when the same gate screen outlasts three approvals with no other screen between them does auto-approve stand down and record the stand-down line once. Any non-gate capture, or a different gate, restores the full budget.

## Reproduction

- `.janissary/notifications.json` for the remote `issues` tab records `Auto-approved a permission prompt` at 17:08:47.516Z, then `Auto-approve could not clear the permission prompt; standing down` at 17:08:48.525Z. It does the same again at 17:14:20.499Z and 17:15:08.066Z.
- `diff` shows that each stand-down capture (`issues-2026-11-06T17-08-48-534Z.txt`, `issues-2026-11-06T17-15-08-078Z.txt`) is byte-identical to the approval capture just before it.
- `detectPermissionGate(text, 'claude')` returns `true` for both capture files, so the detector is not at fault.
- New test `src/harness/auto-approve-repeat.test.ts` feeds the captured subagent gate twice in a row. Against the current code, `approve` is called once instead of twice.

## Approach

In `src/harness/auto-approve.ts`, count consecutive approvals of the same gate text. When a capture repeats the last approved text and that count is below `MAX_IDENTICAL_APPROVALS` (3), inject the keystroke again and report it as an approval. Once the count is reached, keep today's one-time stand-down. A non-gate capture resets the count. So does a new gate text, which is approved with the count starting at one.

## Implementation steps

1. Add the regression test `src/harness/auto-approve-repeat.test.ts`, built on the captured subagent retry gate.
2. Add the approval counter and the `MAX_IDENTICAL_APPROVALS` constant to `HarnessAutoApprover.onCapture`.
3. Update the existing loop-guard tests in `src/harness/auto-approve.test.ts` that assumed a stand-down on the first repeat.
4. Update the stand-down paragraph in `product/specs/harness.md`.
5. Run `$janissary/scripts/run.mjs check-diff`.

## Regression test

`src/harness/auto-approve-repeat.test.ts`:
- The repeated subagent gate is approved twice, with no stand-down.
- Five identical captures produce three approvals and one stand-down.
- A non-gate capture restores the full budget.

## Verification

No live end-to-end check is possible. Reproducing the failure needs a real claude harness whose subagent re-asks an identical permission prompt within one capture window. That depends on claude's own tool-call behavior and its approval UI, and this environment can't drive either deterministically. The unit test feeds the captured screens straight to the approver instead.

## Out of scope

- Changing capture throttling in `HarnessScreenReader`.
- The codex and opencode detectors, which share the guard and get the same budget without other changes.
