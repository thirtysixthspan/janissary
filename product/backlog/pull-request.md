<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle the remote caller case where identical commands settle out of order, which strands a pending request and hangs the run

Existing Issue: `ranCommand` in `src/remote/serve-acp-loop.ts` deletes the first pending entry whose command text matches without checking whether that entry is settled, so when two identical caller-side commands settle out of order the later result's `toolResult` finds no entry, its deferred promise never settles, and the loop waits forever with an undecremented `inFlight`. Severity: 8/10

Existing Risk: 8/10 - A remote batch containing two identical commands, exactly the parallel completion-ordered case the feature promises, leaves one result permanently pending so no follow-up or `acp-run-end` frame is ever emitted and the user must abort to recover; a workspace or gate command whose text matches a pending caller command can also have its `acp-tool-step` suppressed.

Proposal Risk: 2/10 - Restricting consumption to settled pending entries restores one-to-one correlation without changing the wire protocol, the existing correlation tests pin the normal paths, and a command's `ranCommand` cannot fire before its `toolResult` because the loop awaits the deferred promise.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2137 "fix remote caller correlation for identical commands completing out of order". In `src/remote/serve-acp-loop.ts`, change the `ranCommand` handler's pending lookup so it deletes an entry only when `call.command === command && call.settled` is both true; leave an unsettled entry in the map and fall through to emit the normal `acp-tool-step` frame. Keep the `PendingCall.settled` flag and the `toolResult` duplicate guard as they are. In `src/remote/serve-acp-loop.test.ts`, add a case under the parallel caller correlation suite where two identical caller commands receive their `acp-tool-result` frames in reverse request order, then assert both requests are consumed, both outputs reach their follow-ups, no `acp-tool-step` is emitted, and the run ends `answered`; also extend the workspace and gate step tests so the non-caller command's text matches a pending caller command and assert its `acp-tool-step` is still emitted. The existing `startRemoteLoop` suites and the per-command metadata tests in `src/acp/drive-loop.test.ts` must keep passing unchanged.


* Correct the stale `failed` reason comment on the ACP loop handler type

Existing Issue: The `finished` handler's comment in `src/acp/types.ts` still says `failed` is the outcome when a command throws or rejects, but the loop now turns those into ordinary follow-up results and never emits `failed`. Severity: 2/10

Existing Risk: 2/10 - A reader extending a consumer or writing a test trusts the comment and handles a terminal reason the loop no longer produces, or assumes a command error still ends the run.

Proposal Risk: 1/10 - This is a comment-only edit with no behavior change, and `product/specs/acp.md` already states the accurate contract in its tool-loop paragraph.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2137 "correct the stale failed reason comment on the ACP loop handler type". Rewrite the trailing comment on `AcpLoopHandlers.finished` in `src/acp/types.ts` to say the loop emits `answered` or `capped` and that `failed` remains in the union only for other producers, matching the wording already used in `product/specs/acp.md`. Make no code change. Verify by reading the comment against `runAcpToolLoop` in `src/acp/loop.ts`, which no longer calls the finish path with `failed`, and against the spec paragraph; the existing tests in `src/acp/loop.test.ts` and `src/acp/drive-loop.test.ts` already assert that command errors become ordinary results and must keep passing.
