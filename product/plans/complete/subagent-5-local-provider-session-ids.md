# Local provider session IDs
**Complexity: 5/10** — ~20 added production lines, 3 existing files, 7 requirements, 19 scenarios (p=5.43)

## Goal

Add optional `onSessionStarted(sessionId)` to `AcpOptions`; fire it once after assigning the provider's `newSession` response ID and before effort selection. The session handle has no ID accessor and Janissary mints no replacement provider ID.

Source: `product/plans/complete/subagent.md`, preserved unchanged as the canonical feature record. This is ordered subplan 5 of 23.

## Decisions and dependencies

Dependencies: `product/plans/ready/subagent-1-grammar-and-primers.md`, which creates the subagent spec extended here. No later launch, invocation or delivery API is required.

Implement and verify only against existing repository code and the completed earlier dependencies. Other units own their own changes; references to them explain integration boundaries and do not authorize future API calls. Every new production module stays within 200 counted lines, source imports name defining modules directly with .js extensions, and shared wire definitions are imported by the client.

## What already exists (reuse, don't rebuild)

`AcpOptions` at `src/acp/types.ts:32` is the shared optional-hook contract used by every local ACP consumer. `ensureSession` at `src/acp/index.ts:125` memoizes one initialization in `ready`; its post-`newSession` killed check and ID assignment are at lines 134–135, effort configuration follows at line 136, and `onConnect` follows that work at line 149. `CoreSession` and `sessionIdentity` at `src/acp/session-manager.ts:16,32` already hold an internal lifetime identity, while the `current` closure at line 53 checks holder, tab runtime and closing state. `close` at line 106 deletes that exact holder before killing its session. Reuse those guards rather than adding another label-keyed map or changing the existing identity contract.

## Planned file scope

Edit `src/acp/types.ts`, `src/acp/index.ts`, `src/acp/session-manager.ts`; extend `src/acp/index.test.ts`; add focused `src/acp/session-manager.test.ts`; update provider identity behavior in `product/specs/acp.md` and `product/specs/subagent.md`.

Only the named implementation, test and spec/help files belong to this unit. Update the named behavior spec with this unit rather than deferring it to final documentation work. A new colocated test named above may be created when absent. Keep additions focused; do not compact code to fit the line limit.

## Implementation steps

1. Add optional `onSessionStarted(sessionId)` to `AcpOptions`; invoke it immediately after the existing post-`newSession` killed guard and provider ID assignment, before selecting or setting effort and before `onConnect`. Pass the provider's response string unchanged. Reuse the memoized `ensureSession` promise to make the hook fire once across repeated prompts, cold-start retries and cancellation that keeps the same initialized session. Initialization or `newSession` failure and a session killed before its response publish no ID. An effort-selection/configuration failure after the ID was assigned does not retract that already-reported ID. The session handle has no ID accessor and Janissary mints no replacement provider ID.

2. Add optional `providerId` to the role's existing `CoreSession` holder. Wire a local `onSessionStarted` callback in `AcpSessionManager.session` that stores it only while the existing `current` guard still passes. This must also work when a synchronous test transport invokes the callback before `holder.session` has been assigned: the holder is already installed in the role map. Old-holder callbacks, replaced tab runtimes and closing tabs cannot update the current holder. No provider ID is copied when a replacement holder is created.

3. Expose `providerSessionId(label, role = DEFAULT_ACP_ROLE)` returning that holder's reported ID only when it still belongs to the tab's current, nonclosing runtime. Return undefined before the hook fires, after close/reset or tab removal, and for a stale/replaced/closing runtime. Keep ask and tell independent. Retain `sessionIdentity`, `startAcp`'s session result and `AcpPromptResult.session` as their existing internal identities; do not replace them with provider IDs or add this ID to `AcpInfo`, the wire protocol or plugin results.

4. Wire only the local `connectAcp` branch here; remote callback parity belongs to plan 6 and its hook does not exist yet. The optional transport hook leaves other callers unchanged. Preserve normal role sessions' lazy initialization, and preserve existing autonomous consumers' eager initialization when they opt in. For a real local role tool loop the provider ID is known before its first emitted command, because prompting waits for `ensureSession` to complete. All three production files remain below 200 counted lines: current counts are approximately 170 in index.ts, 83 in types.ts and 146 in session-manager.ts, so this unit needs no extraction.

## Tests

Extend the real dependency-free ACP stub and `connect` fixture in `src/acp/index.test.ts:40,204` so tests can capture the optional hook without changing existing call sites. Cover an exact `stub-session` callback once across repeated prompts; callback ordering before effort configuration and `onConnect`; preservation of the reported ID when later effort setup fails; no callback on initialize or `newSession` failure; no late ID after kill during initialization; and cancellation before handshake that still completes viable initialization and reports one ID. Assert ordinary connections do not initialize merely because the new hook is supplied, while the existing autonomous path still initializes before prompting. Callers omitting the hook continue to work.

Use a focused mocked-transport `AcpSessionManager` fixture in the new session-manager.test.ts, following the existing captured `AcpOptions` pattern at `src/acp/record-feed.test.ts:49` and minimal manager fixtures at `src/acp/manager.test.ts:55`. Test undefined before handshake, exact ID after the hook, independent default-ask/explicit-tell IDs, close/reset clearing the exposed ID, stale callbacks after session replacement, and replaced/removed/closing tab runtime rejection. Include a synchronous callback during session construction and confirm the internal `sessionIdentity` remains distinct and unchanged. These tests require no subagent command or future delivery API.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after implementation changes. Do not run `npm run check`.

Manual or fixture check: Open a local role session in the focused fixture and inspect both accessors before its first prompt. Invoke its captured handshake callback with a provider ID, then verify `providerSessionId` reports that value while `sessionIdentity` remains `acp-N`. Close and replace the role session, invoke the old callback, and verify the replacement still has no provider ID until its own handshake. The public subagent command remains unwired.

## Out of scope

No new handle accessor, delivered prompts, remote frame changes, or subagent launch.
