<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Preserve the auto-approve setting when a detached remote harness tab is reconstructed.

Existing Issue: `startSessionAttach()` recreates every detached harness with `autoApprove: false` even when the still-running far-side detector retained the original enabled policy, so the restored tab hides its auto-permitting flag while continuing to inject approvals. Severity: 6/10

Existing Risk: 7/10 - A user can read the restored tab as no longer auto-approving while the remote harness continues granting permission prompts unattended against its workspace.

Proposal Risk: 2/10 - Persisting one optional boolean can expose stale records from older builds, but a default of false and protocol-backed tests keep that compatibility failure contained and visible.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1161: preserve auto-approve state across detached attach". Carry the harness spawn’s `autoApprove` value through `RemoteProcessState` in `src/remote/protocol.ts`, `RemoteProcesses.states()` in `src/remote/serve-processes.ts`, and `SessionRouter.spawnedProcesses()` in `src/remote/channel-sessions.ts`. Persist it as an optional field on harness entries in `src/sessions/store.ts` via `src/sessions/snapshot.ts`, validate it while continuing to accept older records without the field, and have `src/sessions/attach.ts` pass the recorded value to `HarnessManager.attachRemote()` instead of hard-coding false. Add round-trip, store, snapshot, and attach tests proving an enabled remote policy restores an enabled metadata flag and a missing legacy value restores false. Update the version-18 protocol rationale and the harness and remote-server specs, then verify with the diff-scoped server checks.


* Emit remote busy-state frames only when the busy or unread decision actually changes.

Existing Issue: `BusyTracker.observe()` returns the same busy or ready decision for every settled capture after the debounce, and the remote consumer emits a wire frame and full `state:dirty` broadcast for each one even though the PR describes `busy-transition` as a real state change. Severity: 5/10

Existing Risk: 5/10 - A chatty remote harness can add a steady stream of redundant protocol traffic and whole-state broadcasts, repeatedly reapplying unread state on a high-frequency terminal-output path.

Proposal Risk: 2/10 - Suppressing duplicate decisions could hide a needed unread edge if the comparison ignores that flag, which focused gate stand-down and busy-ready tests will catch.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1161: suppress duplicate remote busy-state frames". Make `BusyTracker` in `src/harness/busy-status.ts` retain the last reported `{ busy, unread }` decision and return only when either value changes, while keeping `current()` authoritative for the one-shot attach snapshot. Preserve the two-capture ready debounce and the distinct auto-approved gate to stood-down gate edge, where busy stays false but unread changes from false to true. Update `src/harness/busy-status.test.ts` to cover repeated busy, repeated ready, and repeated stuck-gate captures, update `src/remote/serve-processes.test.ts` to assert one frame per real decision, and keep `src/remote/serve.test.ts`’s single attach snapshot coverage. Confirm `src/remote/pty-session.ts` emits `state:dirty` only for those delivered changes, then verify with the diff-scoped server checks.
