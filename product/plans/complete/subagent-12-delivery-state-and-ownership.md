# Subagent messages, queues, and caller ownership
**Complexity: 6/10** — ~95 added production lines, 4 existing files, 12 requirements, 27 scenarios (p=6.36)

## Goal

Define the started/completion message contract, internal caller ownership, and per-role pending queue used by later delivery work. Keep provider IDs in ACP message payloads separate from the internal session identity that binds a delivery to its original caller. Supply shared human wording without requiring ACP caller metadata.

Source: `product/plans/complete/subagent.md`, preserved unchanged as the canonical feature record. This is ordered subplan 12 of 23.

## Decisions and dependencies

Dependencies: `product/plans/ready/subagent-3-record-naming.md` for optional `subagentRole` provenance, `product/plans/ready/subagent-4-partial-outcome.md` for the complete `AgentOutcome` union, and `product/plans/ready/subagent-5-local-provider-session-ids.md` for the provider/internal identity distinction. Plan 1, inherited through those dependencies, creates the subagent spec extended here. No later launch or delivery API is required.

Implement and verify only against existing repository code and the completed earlier dependencies. Other units own their own changes; references to them explain integration boundaries and do not authorize future API calls. Every new production module stays within 200 counted lines, source imports name defining modules directly with .js extensions, and shared wire definitions are imported by the client.

## What already exists (reuse, don't rebuild)

| Existing owner | Reuse |
| --- | --- |
| `src/acp/role-state.ts:5,7,12` (`AcpRoleRuntime`, `acpRoleRuntime`, `existingAcpRoleRuntime`) | Per-tab, per-role state and lazy access; no delivery manager map. |
| `src/tab/types.ts:304` (`TabRuntime.acpRoles`) | Backing runtime currently repeats the role shape inline; replace that repetition with the canonical `AcpRoleRuntime` type. |
| `src/agent/run.ts:17,56,84,192` (`AgentRunOptions`, constructor, `view`, `copyAgentCaller`) | Optional run options, compatible positional construction, explicit client projection, and the copied/frozen caller convention. |
| `src/agent/manager.ts:34,41,49,137` (`create`, record `metadata`, `new AgentRun`, `dispose`) | Validate existing string-only record provenance, pass run-only ownership separately, and expose the existing `disposed` flag. |
| `src/acp/session-manager.ts:32,47` (`sessionIdentity`, `CoreSession.identity`) and plan 5's `providerSessionId` | The internal lifetime token and the provider-reported caller ID are different values; neither accessor is replaced. |

The only production `new AgentRun` is in manager.ts; direct tests pass up to the current five positional arguments. Ordinary local and remote run creation at `src/agent/workspace-execution.ts:53` (`startLocalAgentRun`) and `src/agent/launch.ts:114` (`managers.agent.create`) must continue to omit the optional ACP caller data.

## Planned file scope

New `src/subagent/messages.ts`, `src/subagent/messages.test.ts`, `src/acp/subagent-queue.ts`, `src/acp/subagent-queue.test.ts`; edit `src/acp/role-state.ts`, `src/tab/types.ts`, `src/agent/run.ts`, `src/agent/manager.ts`; extend `src/agent/manager.test.ts`; update message, human wording, queue and identity contracts in `product/specs/subagent.md`.

Only the named implementation, test and spec/help files belong to this unit. Update the named behavior spec with this unit rather than deferring it to final documentation work. A new colocated test named above may be created when absent. Keep additions focused; do not compact code to fit the line limit.

## Implementation steps

1. Define readonly `SubagentStartedMessage`, `SubagentCompletionMessage`, their `SubagentMessage` union, and `SubagentDelivery` in messages.ts. Started has exactly `status`, `role`, `sessionId`, `callerId`, in that order: status is `started`, role is the supplied canonical subagent role, and both IDs are provider strings. Completion has exactly `status`, `sessionId`, `callerId`, `output`, in that order: status reuses `AgentOutcome` including partial, sessionId is a provider string or null, callerId is a provider string, and output is verbatim text. Completion has no role field, and started has no output. No IDs are minted, substituted with internal tokens, or inferred by this layer; the producer supplies null when no subagent handshake succeeded.

   `SubagentDelivery` is an internal envelope with `runId`, `callerIncarnation`, `callerRole` (the existing ask/tell `AcpRole`), `callerSessionIdentity` (the captured internal token), `subagentRole` (the canonical role string), and `message`. `serializeSubagentMessage(message)` selects only the variant's declared payload fields in their specified order and JSON-serializes them without indentation, lead-in or trailing newline. Rebuild the selected payload rather than spreading the envelope or serializing an arbitrary object, so structurally extra properties cannot leak. Embedded newlines, quotes and backslashes remain JSON-escaped on the single physical line; decoding it recovers the original output.

2. Add exported readonly `AgentAcpCaller` in run.ts with `role` (`AcpRole`), `sessionIdentity` (internal), and `callerId` (provider); add optional `acpCaller` to `AgentRunOptions` and a readonly run property. Append it as an optional final constructor argument after executionDir, and copy/freeze the supplied object in the constructor, following `copyAgentCaller`. Manager.create forwards the option through that separate argument. It must never enter manager.create's record metadata, `AgentRecordFeed`, the constructor's view metadata object, or `AgentRun.view()`. Keep plan 3's optional string `subagentRole` provenance separate. The object remains a launch-time snapshot when the original options or a caller session later change; this unit performs no live session lookup. Human subagent runs and ordinary agent runs omit acpCaller, and human replies never require a placeholder callerId or sessionId.

   Expose a readonly `AgentRunManager.disposing` getter that reads only its existing private disposed flag at manager.ts:15. Preserve dispose's existing order: the flag becomes true synchronously before any run cleanup, including an empty manager, and remains true after repeated disposal or cleanup rejection. Do not add a second shutdown flag or implement delivery checks here.

3. Add optional `pendingSubagentMessages` containing `SubagentDelivery` entries to `AcpRoleRuntime`. Replace `TabRuntime.acpRoles`' inline value shape with a type-only import of `AcpRoleRuntime`; do not add a wire field or another copy of the shape. Keep the queue lazy and owned independently by each tab runtime and ask/tell role. In subagent-queue.ts, add pure `enqueueSubagentMessage(pending, incoming)`, returning a new array without mutating its input. Append incoming at the tail. For a completion only, first remove that runId's still-queued started entries; retain every other entry and its relative order, including other runs' started messages and any queued completion. For example, A-started then B-completed followed by A-completed leaves B-completed then A-completed. A started already removed for delivery is unaffected. Never combine messages, replace an earlier queue position with a completion, or deduplicate completions. This helper operates on pending entries only and neither pops a head nor starts a prompt.

4. Add pure `subagentStartedText(role)` and `subagentCompletionText(role, status, output)` in messages.ts. They accept the canonical role and, for completion, `AgentOutcome` and output directly, so human runs need no ACP message or caller IDs. Started is exactly `Subagent <role> started.` Completion is exactly `Subagent <role> <status>.`, two newline characters, then output. Preserve canonical spelling, all Markdown/whitespace and an empty output, with no added suffix or conditional removal of the blank line. These helpers format supplied values; launch/execution owns status selection and the canonical failure/termination output. No background reply is appended in this unit.

The current counted sizes are about 173 lines in run.ts, 140 in manager.ts, 11 in role-state.ts and 193 in tab/types.ts. Allow for the earlier plans' small run.ts additions: keep ownership copying inline in its constructor and the runtime type replacement neutral in size; all four stay below 200 counted lines. The two new pure modules carry serialization and queue logic rather than expanding those owners. Keep every new source import direct with a .js extension.

## Tests

Use new colocated server tests without calling a launch command or future delivery API. In messages.test.ts, assert the exact serialized field order for started and each of completed/partial/failed/terminated, absence of completion role and started output, failed completion with null sessionId, and unchanged provider IDs distinct from internal tokens. Round-trip output containing newlines, quotes and backslashes, and give the serializer a structurally wider payload to verify that envelope/internal fields never enter JSON. Assert exact human started text and all four completion statuses, canonical role casing/spaces, verbatim Markdown/whitespace and the two-newline boundary when output is empty. Human formatting tests supply no caller/session IDs.

In subagent-queue.test.ts, cover empty input, FIFO for interleaved runs, completion coalescing only its own queued started, retention of unrelated started and already queued completions, and completion after started was already consumed. Assert the completion is appended after all surviving ready entries and that the input array is unchanged. Use the existing acpRoleRuntime accessors with minimal `TabRuntime` fixtures to verify independent queues for ask versus tell and for two caller tabs; no manager-level map or transport is needed.

Extend manager.test.ts's `setup` fixture at line 14 and disposal cases at lines 315,358. Verify the run stores a distinct frozen ACP caller copy even after the supplied object changes; record provenance and run/monitor views contain no acpCaller or captured session token/provider caller ID; metadata validation still accepts the normal string-only source with plan 3's optional subagentRole. Cover omitted metadata for a human/ordinary run and legacy direct constructor arguments. Assert disposing is initially false, immediately true for empty disposal and while asynchronous cleanup is pending, and stays true on repeat calls and after cleanup rejection. Settle all fixture cleanup promises before teardown.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after implementation changes. Do not run `npm run check`.

Manual or fixture check: Queue A-started then B-completed, enqueue A-completed, and inspect B-completed then A-completed without mutating the original array. Serialize each payload and check its exact field order and escaped single-line output; separately inspect the human failed/null-handshake case through the text helper without supplying ACP IDs. Create a synthetic manager run with acpCaller, mutate the original object, and confirm the run's captured values persist while its record source and view omit them. This is a foundation fixture check; the public command and prompt delivery remain unwired.

## Out of scope

No prompt dispatch/draining, idle/busy policy changes, stale-session filtering, reset/close hooks, executor, launch producer, record receipt/background reply producer, command registry, or client/protocol surface. Plan 13 consumes these foundations to implement session-bound delivery; this unit must not call its future APIs.
