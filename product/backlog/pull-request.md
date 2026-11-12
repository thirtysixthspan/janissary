<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle an empty caller-tool error message so the failure result cannot be rejected as a malformed frame and fault the whole remote channel.

Existing Issue: When a caller tool throws an error whose message is empty, `errorText` returns an empty string and the adapter sends an `acp-tool-result` frame carrying `error: ''`, which the far-side decoder refuses as malformed. Severity: 4/10

Existing Risk: 5/10 - A plugin or native command that throws `new Error()` during a caller step turns a contained tool failure into a channel-wide fault: `RemoteChannel.dispatch` treats any malformed frame as fatal, kills the transport, and drops every process and ACP session on that remote connection.

Proposal Risk: 2/10 - The fallback removes the malformed frame on this path, but other sender paths that use raw `errorText` on the same channel still carry the same latent empty-message mismatch.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1992 "handle an empty caller-tool error message in the ACP tool result". In `src/remote/acp-session-run.ts`, when the request's `runCaller` rejects, derive the wire text with a non-empty fallback before sending, for example `const message = errorText(error) || 'Command failed.'`, and send `error: message`. Do not change the frame shapes or decoders: `src/remote/frame/decode-acp-run.ts` deliberately rejects an empty `error`, and `src/remote/protocol.test.ts` already pins `error: ''` as malformed, so the sender is the side that must uphold the contract. Keep `errorText(error)` preferred so the existing `database unavailable` case is unchanged, and leave the `ranCommand`-free error behavior and the post-await liveness guard exactly as they are. Add a case to `src/remote/acp-session.test.ts` beside the existing failed-caller test that rejects with `new Error('')`, asserts the sent `acp-tool-result` carries a non-empty error string and no `ranCommand` fires, and keeps the empty-output success case passing; `src/remote/protocol.test.ts` and `src/remote/channel/index.test.ts` need no edits.
