# Keep an empty caller-tool error from malforming the ACP tool-result frame

**Complexity: 2/10** — 3 production lines in one file, 5 stated requirements and 3 test scenarios, no new units (p=3.95).

## Goal

When a caller tool invoked by a remote ACP run rejects, its failure result always carries non-empty text, so the far side decodes it as that tool's ordinary failure instead of rejecting the frame as malformed and faulting the whole remote channel. A non-empty error message still reaches the wire exactly as it does today, a successful empty output still travels as a success, and no frame shape or decoder changes.

## Approach

- In `src/remote/acp-session-run.ts`, derive the error variant's text inside the existing post-await liveness guard with `errorText(error) || 'Command failed.'`, then send it as the `acp-tool-result` error. `errorText` stays preferred, so the existing `database unavailable` case is unaffected; only an empty derived message changes.
- Keep the failure path free of `ranCommand`, and keep the `if (active(turn))` guard exactly where it is, so a result that settles after cancellation, release, or a successor run still sends nothing.
- Leave the frame shapes, `src/remote/frame/decode-acp-run.ts`, `src/remote/protocol.test.ts`, and `src/remote/channel/index.test.ts` untouched. The decoder's non-empty `error` rule is the contract the sender must uphold.

## Implementation steps

1. Edit the `request` catch in `src/remote/acp-session-run.ts` to compute the message with the fallback and send it through the existing guarded `send`.
2. Run `$janissary/scripts/run.mjs check-diff` and fix any failure before continuing.
3. Add the regression test next to the existing failed-caller test in `src/remote/acp-session.test.ts`.
4. Update `product/specs/remote-server.md` with the sender-side guarantee and the fallback text.
5. Run `$janissary/scripts/run.mjs check-diff` again.

## Tests

- A new case beside `answers a failed caller tool with the error text and no command event` rejects with `new Error('')`, waits for the sent `acp-tool-result`, and asserts it carries the non-empty fallback `Command failed.`, with no `ranCommand` event.
- The existing failed-caller case continues to pin `database unavailable`, proving a real message is preferred over the fallback.
- The existing `answers a caller tool request with output %j` case continues to pin both non-empty and empty output as successful results.

## Out of scope

- Other senders that call `errorText` directly on the same channel and could still carry an empty message. The proposal records that as remaining latent risk; this fix repairs only the caller-tool failure path named by the entry.
- Any decoder, protocol-version, frame-shape, or channel-dispatch change. The contract is already correct on the receiving side.
- New user documentation. The fallback is internal failure text and no command, flag, key, or documented setting changes.
