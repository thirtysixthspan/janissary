# Lift the agent tab's intent builder into the shared layer

## Complexity

5/10 — one module and its test move across a layer boundary, its signature gains a parameter, and four components change. No new architecture, but the harness tab's inlined calls have to be replaced without altering what it sends.

## Goal

`agentTabIntents` turns the shared meta row's callbacks into protocol calls, but it lives inside the `agent-tabs` feature while `AgentTabMeta` — the component it serves — lives in `shared/`. The harness tab may not import a sibling feature under §3, so it inlines three `client.send` calls directly in its JSX instead, which is §8 (a component imports hooks and pure modules, not services) reached past. The two call sites have already diverged — one sends `openTranscriptFor`, the other `openHarnessTranscriptFor` — so a renamed or re-parameterized RPC has to be found by grep across two features. Move the builder beside the component whose props it builds, and have all three components call it.

## Approach

Move `web/src/agent-tabs/agent-tab-intents.ts` and its colocated test to `web/src/shared/`, beside `AgentTabMeta.tsx`. The module imports only `@shared/protocol` and `../ws`, so it stays legal under the shared zone's "must not import a feature" rule after the move.

The one place the two callers genuinely differ is the transcript RPC. Take it as a third parameter rather than branching on tab kind inside the module — a branch on which feature is calling is exactly the feature-specific knowledge §2 forbids a shared module to acquire. Type the parameter as a union of the two protocol methods so a typo is a type error:

```ts
export type TranscriptMethod = 'openTranscriptFor' | 'openHarnessTranscriptFor';
export function agentTabIntents(client: JanusClient, label: string, transcriptMethod: TranscriptMethod): AgentTabIntents
```

`onOpenTranscript` then sends `{ method: transcriptMethod, params: { label } }`. Every other callback is unchanged.

Both agent tab bodies pass `'openTranscriptFor'`; the harness tab passes `'openHarnessTranscriptFor'`, which is exactly what its inlined call sends today. The harness tab keeps its existing `cwd === undefined ? undefined : …` guard on `onLaunchAgentHere`, matching what both agent tab bodies already do — the guard belongs to the caller, not to the builder.

## Implementation

1. `git mv web/src/agent-tabs/agent-tab-intents.ts web/src/shared/agent-tab-intents.ts` and `git mv web/src/agent-tabs/agent-tab-intents.test.ts web/src/shared/agent-tab-intents.test.ts`. Both files' `../ws` import is correct from either directory and needs no change.
2. Add the `TranscriptMethod` type and the third parameter to `agentTabIntents`, and send `transcriptMethod` from `onOpenTranscript`.
3. Point `web/src/agent-tabs/AgentTabBody.tsx` and `web/src/agent-tabs/InactiveAgentTabBody.tsx` at `../shared/agent-tab-intents` and pass `'openTranscriptFor'`.
4. In `web/src/harness/HarnessTab.tsx`, build `const intents = agentTabIntents(client, label, 'openHarnessTranscriptFor')` and replace the three inline arrow functions in the `AgentTabMeta` element with `intents.onOpenFileNavigator`, the cwd-guarded `intents.onLaunchAgentHere`, and `intents.onOpenTranscript`.
5. Run `./scripts/run.mjs check-diff` after each step.

## Tests

`web/src/shared/agent-tab-intents.test.ts` travels with the module and is updated for the new signature:

- The existing three cases pass `'openTranscriptFor'` and keep asserting the same five method names and params.
- One new case: built with `'openHarnessTranscriptFor'`, `onOpenTranscript` sends that method with the same label — proving the transcript RPC is caller-supplied and not a branch inside the module.

`web/src/harness/HarnessTab.test.tsx` already asserts that the metadata buttons dispatch `openFileNavigatorFor`, `launchAgentFor`, and `openHarnessTranscriptFor` with the tab label, and `web/src/shared/AgentTabMeta.test.tsx` pins the rendered buttons. Both must keep passing unchanged — they are the proof that routing the harness tab through the shared builder changed nothing on the wire.

## Out of scope

- Changing `AgentTabMeta`'s props to take an `AgentTabIntents` object instead of five separate callbacks. The component's contract stays as it is.
- Moving the `cwd === undefined` guard on `onLaunchAgentHere` into the builder — it is a caller's rendering decision, and all three callers already make it the same way.
- Any other `client.send` call inlined in a component's JSX outside these three call sites.
- Changing either transcript RPC's server-side behavior.

## Verification

- `./scripts/run.mjs check-diff` passes.
- `grep` shows no remaining `client.send` inside `HarnessTab.tsx`'s `AgentTabMeta` element, and no `agent-tabs/agent-tab-intents` import anywhere.

## Documentation and specification impact

None. Both metadata rows keep sending exactly what they send today; nothing a user can observe changes.
