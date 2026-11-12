# Correct the remote ACP session module comment

**Complexity: 2/10** — ~20 comment lines in 1 production file, 5 requirements, no tests or new units (p=3.796)

The module comment at the top of `src/remote/acp-session.ts` still describes the pre-split adapter: a session satisfying `AcpSession`, only prompt text and reply chunks crossing the wire, and `runAcpToolLoop` driving it without knowing the agent is remote. The type and the loop have since split, so the prose now teaches a contract the code no longer has. It is also the first thing a contributor reads before touching the adapter.

## Goal

Make the module comment describe the post-split remote ACP contract and the frames a run actually uses, without changing code or tests.

## Approach

- Rewrite the module doc comment to say `RemoteAcpSession` is `Omit<AcpSession, 'prompt'>` plus `run`, `ready`, `release`, and `remote: true`, following the same adapter pattern as `createRemoteShell`.
- State that `runToolLoop` in `src/acp/drive-loop.ts` branches on the `remote` discriminant and hands the run to `run` rather than driving it in-process through `driveToolLoop`; `run` returns once the request is admitted, and the frames that follow settle it.
- Name the loop's channel frames: `acp-run`, `acp-turn`, `acp-chunk`, `acp-tool-step`, `acp-tool-request`/`acp-tool-result`, `acp-cancel`, and `acp-run-end`, noting that none of them is JSON-RPC.
- Describe cancellation and run completion: `cancel` sends `acp-cancel`, and the far side's terminal `acp-run-end` (`answered`, `capped`, or `cancelled`) settles the run, while transport loss releases it with an error.
- Change the inline "one in-flight prompt" comment beside the `AcpPromptControl` instance to say "run".
- Leave the closing paragraph about holding no reference to `Managers`, the tab, or the transcript intact.

## Implementation steps

1. Update the module comment in `src/remote/acp-session.ts`.
2. Update the inline comment above `const control = new AcpPromptControl()`.
3. Read the result against `src/remote/acp-session.ts`, `src/remote/acp-session-run.ts`, `src/acp/drive-loop.ts`, and `src/remote/protocol-frames.ts`, confirming every claim matches the current code and no pre-split wording remains.

## Tests

None. This is a comment-only change; `src/remote/acp-session.test.ts` already pins the frame-to-callback behavior. Verification is the read in step 3; `$janissary/scripts/run.mjs check-diff` will show only the plan and backlog, not a source behavior change.

## Out of scope

Any code or test change. Deleting the legacy `acp-prompt`/`acp-end` path, the far side's `RemoteAcp.prompt`, or the protocol version bump (subplan 25). Rewriting `product/specs/acp.md`, whose remote-connection section already describes this behavior accurately.
