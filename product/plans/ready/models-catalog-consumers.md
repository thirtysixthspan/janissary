# Model catalog consumers

**Complexity: 5/10** — the new manager must replace the old global lookup across launch, completion, ACP, agent, conversation, and plugin-context paths without changing their surrounding behavior.

## Goal

Move every server-side model consumer to `managers.models`, so disabled records stop being offered or launched immediately and catalog updates reach every consumer without a restart.

## Decisions and dependencies

- Depends on the completed `product/plans/complete/models-catalog-manager.md`; this is the first subplan that removes the compatibility lookup introduced for staging. Use its `managers.models.modelsFor(harness)` and `managers.models.isKnownModel(harness, id)` contracts.
- The manager is the only catalog source. Consumers with an existing `Managers` object read `managers.models`; pure helpers receive a narrow `(harness: string) => string[]` lookup callback. Do not add a module-level catalog or import the compatibility module from consumers or tests.
- Use `modelsFor`/`isKnownModel` for launch and selection decisions, not the manager's visible `view()`: `disabled` excludes a model from consumers, while a record with only `hidden` remains launchable and selectable.
- A disabled ask-role entry is skipped on every attempt, including the current entry of an open ACP session. Build the queue by applying `attemptOrder(entries, currentEntry)` first and then filtering through `managers.models.isKnownModel`, so the preferred current entry is filtered too. If none remain, preserve `NO_ASK_MODEL` (`ACP: the ask role lists no models.`).
- Preserve the established `harness --model` refusal text, agent default-model preference, completion grammar, conversation model ordering and fallback, and ask-role attempt ordering.
- A manager lookup callback must retain its receiver: pass a closure that calls `managers.models.modelsFor(harness)`, not the unbound method reference.
- Update the harness, ACP, and conversations behavior specs as specified below. Keep edited files within the repository's 200 nonblank, noncomment line limit; extract code rather than compacting or deleting comments if an implementation file would exceed it.

## Existing code to reuse

| Need | Existing code |
| --- | --- |
| Authoritative catalog and disabled filtering | `ModelCatalogManager.modelsFor` and `isKnownModel` at `src/models/manager.ts:47-54` |
| ACP role ordering and fallback | `attemptOrder` at `src/acp/ask-role.ts:37`; `AcpManager.queueFor` at `src/acp/manager.ts:126` |
| Completion dependency threading | `completeCommandLine` at `src/completion/index.ts:37`; `completeHarnessModel` at `src/completion/handlers.ts:67`; production caller `complete` at `src/controller/completion.ts:9` |
| Conversation model construction and validation | `availableConversationModels` and `hasConversationModel` at `src/conversations/view.ts:25-30`; manager callers at `src/conversations/manager.ts:42,73,80,127`; responder caller at `src/conversations/responder.ts:50` |
| Plugin launch catalog capability | `harnessLaunchCatalog` at `src/plugins/context.ts:157`; roles activation reads it through `payloadFrom` at `src/plugins/roles/activate.ts:67,115` |
| Compatibility layer being retired | `loadHarnessModels`, `modelsFor`, and `isKnownModel` at `src/harness/models.ts:8-16`; startup call at `src/main.ts:76` |

## Proposed changes

1. Update `src/harness/manager.ts` to use `managers.models.isKnownModel` for `--model` validation at the current `parsed.model` check (`src/harness/manager.ts:74`) and `managers.models.modelsFor` for launch choices in `harnessLaunchView` (`src/harness/manager.ts:98`). Keep the exact refusal `Unknown model "<model>" for harness "<name>" — add it to known-models.json.` A disabled model is refused the same way as an unknown one.
2. Update `AcpManager.queueFor` (`src/acp/manager.ts:126`) to order entries with `attemptOrder` and then filter through `managers.models.isKnownModel`, preserving the current-session preference only when that entry remains enabled. Cover a disabled noncurrent entry, a disabled current entry falling through to the next enabled entry, and all entries disabled returning `NO_ASK_MODEL` in `src/acp/manager-fallback.test.ts`.
3. Change `selectedModel` (`src/agent/model.ts:3`) to accept the available opencode model list as an argument and remove its legacy import. Preserve its current preference for `google/gemini-3.1-flash-lite` when available, then the first available model, and its existing refusal for a requested model not in the list. Pass `managers.models.modelsFor('opencode')` from `executeAgentRun` (`src/agent/execute.ts:62`) and `AgentRunManager.create` (`src/agent/manager.ts:40`).
4. Change `completeHarnessModel` (`src/completion/handlers.ts:67`) to accept the model lookup. Append an optional final lookup parameter to `completeCommandLine` (`src/completion/index.ts:37`), after `files`, so unrelated direct completion callers keep their existing signature and receive no model suggestions unless a catalog lookup is supplied. Thread the callback to `completeHarnessModel`; `complete` (`src/controller/completion.ts:9`) supplies a closure calling `managers.models.modelsFor(harness)`. Remove the direct legacy import.
5. Make `availableConversationModels(modelsFor)` and `hasConversationModel(pair, modelsFor)` in `src/conversations/view.ts` use the supplied lookup. Pass a closure calling `this.managers.models.modelsFor(harness)` from `ConversationsManager` for its view, create, and select-model paths, and pass the same lookup into `ConversationResponder` so sending after a saved model becomes disabled falls back to the first available pair. Keep the existing claude-then-opencode ordering.
6. Change `harnessLaunchCatalog` (`src/plugins/context.ts:157`) to query `managers.models.modelsFor` for each harness, so the New harness dialog gets enabled ids and sees changes after manager updates. Update `src/models/catalog-file.test.ts`, which moved from the old harness-model tests and currently imports the compatibility module: preserve bundled catalog, decoding, encoding, override, warning, and stale-filename coverage using `BUNDLED_MODEL_CATALOG` and `readCatalog`; remove only tests of module-level `modelsFor`/`isKnownModel` and `loadHarnessModels`. Update the other compatibility-importing tests named below, then remove `src/harness/models.ts` and `loadHarnessModels(cwd)` plus its import from `src/main.ts`.
7. Update `product/specs/harness.md` § Launching with a model and effort level (`:1034`) for the disabled-model refusal and live catalog changes. Update `product/specs/acp.md` § Provider and model (`:27`) to state that disabled entries are filtered on every attempt, including an already-open current entry, and that an all-disabled ask role retains `NO_ASK_MODEL`. Update `product/specs/conversations.md` § model selector (`:41`): it offers enabled models only, catalog changes update its choices, and a saved pair that becomes disabled or disappears falls back to the first available pair on the next query.

## Tests and verification

Run `$janissary/scripts/run.mjs check-diff` after each implementation change. Update the tests that directly import the compatibility module: `src/agent/execute.test.ts`, `src/agent/model.test.ts`, `src/commands/agent.test.ts`, `src/completion/handlers.test.ts`, `src/completion/index.test.ts`, `src/models/catalog-file.test.ts`, and `src/plugins/context.test.ts`. Add or update disabled-model coverage in `src/harness/manager.test.ts`, `src/acp/manager-fallback.test.ts`, `src/agent/model.test.ts`, `src/completion/handlers.test.ts`, `src/completion/index.test.ts`, `src/conversations/manager.test.ts`, and `src/plugins/context.test.ts`. Update all fixtures that instantiate an affected manager/responder with a `Managers` test double: `src/acp/manager-fallback.test.ts`, `src/acp/manager.test.ts`, `src/acp/index.test.ts`, `src/acp/plugin-session.test.ts`, `src/acp/record-feed.test.ts`, `src/conversations/manager.test.ts`, `src/plugins/notifications.test.ts` (direct `ConversationResponder` construction), `src/agent/execute.test.ts`, `src/agent/manager.test.ts`, `src/controller/create-managers.test.ts`, `src/plugins/launch-tab.test.ts`, and `src/plugins/launch-tab-remote.test.ts`. Confirm refresh visibility, saved-conversation fallback, and the established `harness --model` refusal.

Manual, in a scratch project with a `known-models.json` override loaded at startup, mark one available model disabled. Verify that `harness <harness> --model <disabled-id>` returns the established unknown-model refusal, command completion omits the id, and the conversations selector omits the disabled pair while retaining enabled pairs.

## Out of scope

- Provider fetching, catalog persistence, and manager lifecycle implementation.
- Models topic actions, models tab UI, role-card missing-model rendering, and help/user documentation.
