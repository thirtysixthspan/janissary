# Translate ACP activity through one shared mapping, and share the agent readiness wait

**Complexity: 6/10** — one new pure module used by both hosts, one new helper replacing two hand-rolled races, a narrowed activity type, and tests for failure branches that have none today.

## Goal

A local agent run and a remote one show the same activity in the agent monitor: the five kinds the spec names (message, thought, tool, plan, permission) with plain text, never a raw `sessionUpdate` name followed by JSON. The readiness wait's timeout and abort branches, and the run's connection-error and empty-answer branches, are pinned by tests.

## Approach

`RemoteAcp.open` in `src/remote/serve-acp.ts` already maps an ACP update to the spec's five kinds with a private `activityKind` and a text extraction (string content, then `content.text`, then JSON). The local `onActivity` in `executeAgentRun` (`src/agent/execute.ts`) passes `sessionUpdate` through unchanged and JSON-dumps everything except text message chunks. Move the remote mapping into a new `src/acp/activity.ts` exporting `acpActivity(update)` (returning `{ kind, text }` or `undefined`), the `ACP_ACTIVITY_KINDS` array, its `AcpActivityKind` type, and an `isAcpActivityKind` guard built on the array. Both hosts call `acpActivity`. `RemoteAcpActivityKind` becomes an alias of `AcpActivityKind`, the two hand-written copies of the union in `src/remote/channel/acp.ts` and `src/remote/acp-session.ts` use it, `decodeAcpActivity` checks membership with the guard (dropping its cast), and `AgentRun.reportActivity` and `AgentRunView`'s activity entries take the narrowed kind.

`executeAgentRun` races the remote session's readiness against an abort signal and a 15-second timer with a hand-rolled deferred, and `abortable` in `src/agent/remote-target.ts` does the same. Replace both with `awaitReady(promise, signal, timeoutMs, timeoutMessage)` in a new `src/agent/readiness.ts`, keeping the one `prefer-promise-with-resolvers` suppression there. The twice-written `Agent: sandboxing is disabled.` notice gets one helper in `execute.ts`.

Local runs stop showing update kinds outside the five (such as `available_commands_update`), which is what `product/specs/agent-command.md` already says the monitor shows.

## Implementation steps

1. Create `src/acp/activity.ts` with the mapping, the kinds array, the type, and the guard.
2. Alias `RemoteAcpActivityKind` to it in `src/remote/protocol-frames.ts`; use it in `src/remote/channel/acp.ts` and `src/remote/acp-session.ts`; use the guard in `decodeAcpActivity` in `src/remote/frame/decode-acp.ts`.
3. Call `acpActivity` from `RemoteAcp.open` (removing its private `activityKind`) and from the local `onActivity` in `executeAgentRun`.
4. Narrow the activity kind on `AgentRunView` in `src/agent/types.ts` and on `AgentRun.reportActivity` in `src/agent/run.ts`.
5. Create `src/agent/readiness.ts` with `awaitReady`, and use it in `executeAgentRun` and `resolveRemoteAgentTarget` (removing `abortable`).
6. Give the sandboxing-disabled notice one helper in `src/agent/execute.ts`.

## Tests

- New `src/acp/activity.test.ts`: each of the five kinds from its ACP update names (`agent_message_chunk`, `agent_thought_chunk`, `tool_call`, `tool_call_update`, `plan`, `permission_decision`), string content, `content.text`, the JSON fallback, an unlisted update kind and a non-update value answering `undefined`, and the guard.
- New `src/agent/readiness.test.ts`: resolves with the promise's value, rejects with the timeout message after the deadline (fake timers), rejects on an abort while waiting, and rejects at once for an already-aborted signal; listener and timer are cleaned up.
- `src/agent/execute.test.ts`: the remote readiness timeout (fake timers), an abort while waiting for readiness, a connection error before the tool loop, a connection error during it, the empty-answer failure, and a local thought chunk arriving as `thought` with plain text.
- Existing coverage stays green: `src/remote/serve-acp.test.ts` (including `agent_thought_chunk` becoming `thought`), `src/remote/acp-session.test.ts`, and `src/remote/protocol.test.ts`.

## Out of scope

- Any change to which ACP updates the agent connection forwards, or to the remote protocol's frames.
- The other readiness waits elsewhere in the remote layer (see the pending-request backlog item).
