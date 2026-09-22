<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Make on-demand capture replies safe across concurrent requests and transport loss.

Existing Issue: `CaptureRequestTracker` stores only one resolver per process id and `RemoteChannel.closed()` preserves those resolvers when entering reconnect mode, so a second request overwrites the first and a request lost with its SSH transport can remain unresolved forever. Severity: 6/10

Existing Risk: 6/10 - Repeated capture commands or a connection drop at the wrong moment can silently strand promises, omit command results, and retain callbacks for the lifetime of a reconnecting channel.

Proposal Risk: 2/10 - Request correlation and explicit settlement add protocol bookkeeping, but malformed or late replies remain observable through narrow decoder and channel tests.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1161: make capture request tracking concurrent and reconnect-safe". Add a request correlation id to `capture-request` and `capture-reply` in `src/remote/protocol.ts`, validate and preserve it in `src/remote/frame-decode-detect.ts`, `src/remote/serve-detach-capture.ts`, and `src/remote/serve-detach-query.ts`, and key `CaptureRequestTracker` in `src/remote/channel-capture.ts` by that correlation id so two requests for the same process settle independently. In `src/remote/channel.ts`, settle every outstanding request before a live channel enters reconnect mode because replies written to the lost transport will never arrive or be replayed. Cover two overlapping requests, out-of-order replies, a late reply, and recoverable transport loss in a new colocated tracker test and `src/remote/channel.test.ts`; extend `src/remote/protocol.test.ts` and the parked-peer tests for the correlated wire shape. Amend the version-18 rationale and the remote-server spec to describe correlation, then verify with the diff-scoped server checks.


* Reject ambiguous detached capture labels instead of querying an arbitrary recorded session.

Existing Issue: `SessionsManager.recordForProcess()` returns the first persisted process with a matching label even though multiple detached sessions can each retain the same former tab label after their tabs close. Severity: 6/10

Existing Risk: 6/10 - `harness capture claude` can silently read and open the screen of the wrong remote host or workspace, giving the user misleading or sensitive output with no indication that the target was ambiguous.

Proposal Risk: 2/10 - Ambiguous names will require the user to attach the intended session first, but the command will fail clearly instead of choosing the wrong screen.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1161: reject ambiguous detached capture labels". Change the persisted-process lookup in `src/sessions/manager.ts` to distinguish no match, one match, and multiple matches rather than returning the first array entry. Update detached resolution in `src/harness/subcommands.ts` to keep the existing missing-label error for zero matches, run the one-off query only for one match, and return a precise ambiguity error for multiple sessions that tells the user to attach the intended session before capturing. Add duplicate-label records covering different hosts and workspaces to `src/sessions/manager.test.ts` and `src/harness/subcommands.test.ts`, and document the error and recovery path in `product/specs/harness.md`. Preserve open-tab precedence, so an existing tab with that label remains an unambiguous target, then verify with the diff-scoped server checks.


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
