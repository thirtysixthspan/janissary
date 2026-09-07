# Resolve the agent tab's ACP model from the harness catalog

**Complexity: 4/10** — one constant becomes a preference resolved against the catalog every other ACP consumer already reads, with a refusal for the empty case. One source file plus its tests; no wire change, no picker, no per-tab selection.

## Goal

Make a project that overrides the model catalog get one of its own models on an `acp` prompt, and make the connections panel report the model the session actually launched with.

## Approach

`AcpManager` defines `ACP_MODEL = 'google/gemini-3.1-flash-lite'` and `ACP_HARNESS`, passes the latter to `acpLaunchFor`, and derives the connections-panel label by running `parseModel` over the same constant rather than over anything the session resolved. Its "only provider wired up" justification stopped being true once the catalog and the conversation picker landed: the other three ACP entry points all take their pair from something the user controls — `spawnMonitorSession` from `persona.harness`, `ConversationSessions` from the pair picked through `availableConversationModels` — and both reach the catalog through `modelsFor`, which honours a project's `.janissary/harness-models.json` override.

Resolve the agent tab's pair the same way. Read the opencode list through `modelsFor`, keep the current constant as the *preferred* entry and fall back to the list's first when the catalog no longer offers it, and refuse with a clear message when the list is empty. Record the resolved model on `this.info` at connect time so `label()` reports what actually launched rather than a constant that can be neither right nor wrong.

The refusal belongs in `run`, beside the existing `stillConnecting` one: `session` returns an `AcpSession` and has nowhere to put an error, and the same message should reach the transcript and any `onDone` caller the way `STILL_CONNECTING` already does. `session` takes the resolved model as an argument — it has exactly one caller, `run` itself — rather than resolving again where it could not report a failure.

The pair stays a manager-level decision. Making it selectable per tab is separate work and would need a wire field and a picker.

## Implementation steps

1. In `src/acp/manager.ts`, rename the constant to record that it is a preference, and add a module-level resolver returning the preferred opencode model when the catalog still lists it, the list's first entry otherwise, and `undefined` for an empty list.
2. Build the launch harness from the resolved model rather than from a frozen constant.
3. Have `session` take the resolved model, use it for both `acpLaunchFor` and the `parseModel` recorded on connect.
4. In `run`, resolve before connecting and refuse with a clear message when nothing is available, reporting it through the transcript and `onDone` exactly as the still-connecting refusal does.

## Tests

`src/acp/manager.test.ts` pins the current launch arguments and the connections label against the bundled catalog, which still lists the preferred model, so those cases keep passing unchanged. `src/acp/launch.test.ts` passes an explicit harness and is unaffected. Added:

- A catalog override that omits the preferred model launches the fallback, and `label()` follows it — the case the whole change is for.
- A catalog override whose opencode list is empty refuses with a message rather than spawning, and reports that message to `onDone`.
- An override that still contains the preferred model keeps using it, so the fallback does not fire whenever an override merely exists.

## Spec updates

`product/specs/acp.md` — the two places that state the model is hardcoded to `google/gemini-3.1-flash-lite`. Say instead that the model comes from the harness catalog's opencode list, that this model is preferred when the catalog offers it, that the first available one is used otherwise, that a project override therefore applies, and that an empty list refuses the prompt.

## Docs

`documentation/user-documentation/advanced-agents/acp-agent.md` claimed there is "nothing to configure"; a "Which model it runs" section is added in place, stating that the model comes from the catalog's OpenCode list, that a project override applies, and that an empty list refuses. The agent itself is still fixed to OpenCode, so that claim stands. `help.md` describes `acp` as sending a prompt to the OpenCode agent and says nothing about the model, so it needs no change.

## Out of scope

- Making the model selectable per tab, which needs a wire field and a picker.
- The other three ACP entry points, which already resolve through the catalog.
- The hardcoded choice of `opencode` as the agent, which is not what this item is about.
