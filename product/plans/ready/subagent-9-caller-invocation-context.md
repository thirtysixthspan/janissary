# ACP caller role and native string results
**Complexity: 5/10** — ~15 added production lines, 3 existing files, 6 requirements, 28 scenarios (p=5.39)

## Goal

Carry the emitting ACP role through native command invocations and their children. Return native string results even for a `coreResponse` command, so a command's refusal reaches the tool caller. Keep ordinary command callers and all other result mappings unchanged.

Source: `product/plans/complete/subagent.md`, preserved unchanged as the canonical feature record. This is ordered subplan 9 of 23.

## Decisions and dependencies

Dependencies: None; this unit is independently implementable against the current repository. If plan 8 has landed, retain its snapshot-row extraction in run-prompt.ts. This unit needs no subagent command, provider-id accessor, session-delivery API, or other later unit.

`acpRole` is optional top-level invocation metadata typed with the existing `AcpRole` (`ask` or `tell`), not the configured role's display name and not a new caller-kind enum. `acpTool: true` remains the sole ACP-tool caller discriminator. Do not infer either field from a tab's capabilities, active session, command text, or `awaitResult`.

Implement and verify only against existing repository code and completed earlier dependencies. Other units own their changes; references to them explain integration boundaries and do not authorize future API calls.

## What already exists (reuse, don't rebuild)

| Piece | Verified location and reuse |
| --- | --- |
| Role type | `src/acp/role.ts:3`, `AcpRole`, defines the two internal role slots. `src/acp/prompt-state.ts:11`, `AcpPendingPrompt.role`, already carries the emitting slot separately from `roleName`. |
| Invocation metadata | `src/commands/types.ts:6`, `CommandInvocationContext`; `src/command/invocation.ts:6,12,36`, `InvocationOptions`, `createInvocationContext`, and `childInvocationContext`. Preserve their frozen context, caller snapshot, signal, lineage, and schedule provenance. |
| Native tool dispatch | `src/acp/run-prompt.ts:43`, private `dispatchNative`, creates the tool invocation and maps the dispatch result. Its only caller is `host.runCaller` in `runCorePrompt` at line 89. `src/acp/manager.ts:128` already passes the request containing the role; its call signature needs no change. |
| Remote caller commands | `src/acp/drive-loop.ts:86`, `runToolLoop`, passes that same `host.runCaller` to a remote session. Local and remote caller steps therefore share this change without a remote frame or protocol change. |
| Dispatcher contracts | `src/command/manager.ts:62,70,82,91,122`, `dispatchLineWithOutput`, `dispatchQueuedLine`, `dispatchLineInInvocation`, `dispatchNativeLine`, and the `coreResponse` branch. A core response carries empty captured output plus an optional result; the manager does not stringify that result. |
| Ordinary capability routes | `src/plugins/line-capabilities.ts:79`, `dispatchLineWithOutput`; `src/plugins/queue-capabilities.ts:24`, `dispatchQueuedCommand`; and `src/schedule/manager.ts:242`, `dispatchTo`, use ordinary manager entry points. `src/plugins/acp-capabilities.ts:25,30`, `promptAcp` and `promptAcpResult`, instead start the existing ask-role prompt; commands emitted by its tool loop receive ACP metadata. |
| Existing test fixtures | `src/command/manager.test.ts:41`, `makeManagers`, and line 357, `copies the ACP tool marker into child invocation contexts`; `src/acp/run-prompt.test.ts:117`, `harness`, line 281, the caller-side command case, and line 525, the remote guarded-runner case. There is no invocation.test.ts to extend. |

## Planned file scope

Edit only the existing production files `src/commands/types.ts`, `src/command/invocation.ts`, and `src/acp/run-prompt.ts`. Extend the existing `src/command/manager.test.ts` and `src/acp/run-prompt.test.ts`; update invocation and tool-result behavior in `product/specs/acp.md`. No new production or test module is needed.

Only the named implementation, test and spec files belong to this unit. Update the behavior spec with this unit rather than deferring it to final documentation work. Keep additions focused; do not compact code to fit the line limit.

## Implementation steps

1. Add optional `acpRole` to `CommandInvocationContext` and `InvocationOptions`, using type-only direct imports of `AcpRole` from its defining role.js module. `createInvocationContext` includes the supplied role only when defined; `childInvocationContext` copies it only when present. Omitted roles remain absent, including for existing callers that supply `acpTool` without a role. Keep the child's shared run id, fresh invocation id, captured caller, exact signal, replacement line, `awaitResult`, `acpTool`, and `systemSchedule` behavior unchanged. Supplying a role alone must not synthesize `acpTool`.

2. Give private `dispatchNative` a required `AcpRole` argument before its optional signal. Its sole `runCorePrompt` caller passes `request.role` explicitly, and the invocation options include that role alongside the existing `acpTool: true`, `awaitResult: true`, and exact prompt signal. Capture the request's role rather than consulting mutable tab state or using `request.roleName`. This covers local sessions, local fallback sessions on remote tabs, and caller commands forwarded from remote sessions through the same closure. Keep the active-prompt guard and cancellation behavior intact; do not export the helper or change `runCorePrompt`'s public signature.

3. After the existing undispatched-result error, return a string `result.result` verbatim before checking `coreResponse`. An empty string is a result too and must not fall back to captured output. For non-string results, retain the current precedence: a core response returns `result.output` even when it has a structured receipt; an undefined ordinary result returns output; any other ordinary result uses the existing JSON serialization with its String fallback. Do not broaden this into returning core-response objects or serializing receipts. Leave `CommandManager` and the similar autonomous-agent mapping at `src/agent/command-tools.ts:36` unchanged.

4. Keep typed `dispatch`/`dispatchTo`, direct `executeCommand`, plugin `dispatchLineWithOutput`, and queued `dispatchQueuedLine` invocations without ACP metadata. Scheduled provenance remains independent. A child dispatch inherits an ACP parent's metadata through the existing `dispatchLineInInvocation`; a child of an ordinary invocation remains ordinary. A plugin calling `promptAcp` or `promptAcpResult` still starts the default ask role, whose emitted native tool commands use step 2. Do not add markers to the capability adapters or classify the command that starts a prompt as an emitted tool command.

5. Update `product/specs/acp.md:99`, the caller-side command paragraph under Autonomous tool loop, to state the marker/role distinction and string-result precedence, including the ordinary capability versus plugin-prompt distinction. Describe current generic dispatch behavior without adding the later subagent command or its refusal wording. The three production files currently count 32, 47, and 138 nonblank/noncomment lines respectively; these small additions fit below 200, including plan 8's row-helper extraction. Preserve spacing, use `.js` import extensions, and add no extraction or duplicated role union.

## Tests

Extend manager.test.ts's existing invocation fixture rather than creating a new test module. Cover each role through root construction and child construction, asserting the role, marker, frozen context, shared run id/caller/signal, new invocation id, and child line. Cover an omitted role, a legacy `acpTool: true` caller without a role, and role-only options that leave the marker absent. Drive `dispatchLineInInvocation` with each ACP role to confirm a real nested command receives the inherited metadata.

Use a fixture command that captures its invocation to check ordinary `dispatch`, `dispatchTo`, `executeCommand`, `dispatchLineWithOutput`, and `dispatchQueuedLine` without and with system-schedule provenance. Both ACP fields stay absent. For the scheduled case, extend the existing nested fixture at manager.test.ts:383 to confirm the child retains provenance while staying ordinary. These manager entry points are the existing capability and scheduling delegates, so no plugin API or scheduler changes are required to verify the distinction.

Parameterize run-prompt.test.ts's local caller-side and remote guarded-runner cases over ask and tell. Assert `acpRole` equals the internal request role even when `roleName` differs, alongside the marker, wait flag, and exact abort signal. The same local fixture exercises the host used by local fallback sessions; no remote protocol fixture is needed. Retain the existing abort/late-callback regressions.

Through that existing harness, stub `dispatchNativeLine` for a currently granted caller command such as `db sqlite query`; test the private mapper through its caller without registering subagent or changing the native vocabulary. Cover the following result contracts with distinguishable captured output so wrong precedence fails:

| Dispatch reply | Expected tool text |
| --- | --- |
| Core response with a refusal string | That exact string, without JSON quotes |
| Core response with an empty string | Empty string, even if stubbed output is nonempty |
| Core response with an object receipt | Captured output, never serialized receipt |
| Core response with undefined result | Captured output |
| Ordinary response with a string | That exact string, before captured output |
| Ordinary response with undefined result | Captured output |
| Ordinary response with a structured object | Existing JSON text |
| Ordinary response whose JSON serialization is undefined | Existing String fallback |
| Undispatched reply carrying a string result | Rejection with `No ACP tool matched command: <command>` before any result mapping |

## Verification

Run `$janissary/scripts/run.mjs check-diff` after implementation changes. Do not run `npm run check`.

Manual or fixture check: Drive the existing run-prompt harness once for each role, including its remote `runCaller`, with a granted native command and a fake core-response refusal. Inspect the invocation's role/marker/signal and returned refusal, then return an empty string and verify it stays empty. Dispatch a fixture through the ordinary plugin-command delegate and confirm neither ACP field appears. This uses current entry points without a public subagent command.

## Out of scope

No role vocabulary, default grants, subagent command, provider session ids, completion delivery, or background lifetime linkage. No plugin API, manager dispatch/capture contract, autonomous-agent result mapping, tool gate, remote frame, protocol-version, or client change.
