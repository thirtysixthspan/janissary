# Extract agent-tab protocol intents

**Complexity: 4/10** — one pure client-intents module, two callers switched to its callbacks, and focused module tests. The wire contract, tab props, and user-visible behavior stay unchanged.

## Goal

Give the active and inactive agent tab bodies one tested definition of the five protocol intents they share.

## Approach

Add `web/src/agent-tab-intents.ts`, following the existing transcript-intents pattern. It accepts the existing client and tab label and returns callbacks for metadata actions, transcript collapse, and ACP transcript opening. Both tab bodies create that object and pass its callbacks to their render children.

## Implementation steps

1. Add the typed `agentTabIntents(client, label)` factory, with direct protocol messages for the five existing callbacks.
2. Replace the duplicated inline `client.send` callbacks in `AgentTabBody` and `InactiveAgentTabBody` with callbacks from that factory.
3. Add focused tests that assert every returned callback sends its existing wire intent and that constructing the factory is effect-free.

## Tests

- `web/src/agent-tab-intents.test.ts` covers the five callbacks and the no-send construction case.
- `./scripts/run.mjs check-diff` verifies the existing active and inactive tab-body tests still exercise the unchanged rendered interactions.

## Out of scope

- Changing the wire protocol, tab-body props, or protocol-client APIs.
- Consolidating the separate command submission and completion callbacks, which are not duplicated agent-tab metadata intents.
