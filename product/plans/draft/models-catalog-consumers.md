# Model catalog consumers

**Complexity: 5/10** — the new manager must replace the old global lookup across launch, completion, ACP, agent, conversation, and plugin-context paths without changing their surrounding behavior.

## Goal

Move every server-side model consumer to `managers.models`, so disabled records stop being offered or launched immediately and catalog updates reach every consumer without a restart.

## Decisions and dependencies

- Depends on `models-catalog-manager.md`; it is the first subplan that removes the compatibility lookup introduced for staging.
- The manager is the only catalog source. Consumers receive it through existing `Managers` ownership or as a narrow lookup parameter, not a new global.
- A disabled ask-role entry is skipped on every attempt, including the current entry of an open ACP session. Filter after applying `attemptOrder`, so the preferred current entry is filtered too. If none remain, preserve `NO_ASK_MODEL` (`ACP: the ask role lists no models.`).
- Preserve existing command refusal wording for `harness --model`, completion behavior, conversation selection, and role picker ordering.
- All implementation changes update behavior specs in this subplan and keep files within the repository limit.

## Existing code to reuse

| Need | Existing code |
| --- | --- |
| Authoritative catalog | `managers.models` from the preceding subplan |
| ACP role ordering and fallback | `src/acp/ask-role.ts` and `src/acp/manager.ts` |
| Completion dependency threading | `src/completion/index.ts` and `src/controller/completion.ts` |
| Conversation model construction | `src/conversations/view.ts` and `src/conversations/manager.ts` |
| Plugin launch catalog capability | `src/plugins/context.ts` and its existing tests |

## Proposed changes

1. Update `src/harness/manager.ts` to use `managers.models.isKnownModel` for `--model` validation and `modelsFor` for launch choices. Keep the existing unknown-model message, `Unknown model "<model>" for harness "<name>" — add it to known-models.json.`. A disabled model is refused the same way as an unknown one.
2. Update `src/acp/manager.ts` to filter the ask-role attempt list through `managers.models.isKnownModel`, preserving order and current-session preference. Add coverage to `src/acp/manager-fallback.test.ts` for one disabled entry and for all entries disabled.
3. Change `selectedModel` in `src/agent/model.ts` to receive its available model list; update callers in `src/agent/execute.ts` and `src/agent/manager.ts` to pass the manager's opencode models.
4. Thread a model lookup through `completeHarnessModel`, `completeCommandLine`, and `src/controller/completion.ts`; remove the direct import of the legacy model module.
5. Make `availableConversationModels` and `hasConversationModel` accept the model lookup, and pass it from `ConversationsManager` and `ConversationResponder`.
6. Change `harnessLaunchCatalog` in `src/plugins/context.ts` to read the manager, so the New harness dialog receives only enabled model ids and refresh changes reach it through the state broadcast. Update every test that imported `src/harness/models.ts` to use a manager or the new catalog contract, including `src/harness/manager.test.ts`, `src/agent/execute.test.ts`, `src/agent/model.test.ts`, `src/commands/agent.test.ts`, `src/completion/handlers.test.ts`, `src/completion/index.test.ts`, and `src/plugins/context.test.ts`; then remove `src/harness/models.ts` and its obsolete tests. Remove the `loadHarnessModels(cwd)` startup call from `src/main.ts` because manager construction now loads the catalog.
7. Update `product/specs/harness.md` for disabled and live-reload behavior and `product/specs/acp.md` for skipping disabled ask-role entries. Update any conversation behavior spec section that describes available model choices.

## Tests and verification

Run `$janissary/scripts/run.mjs check-diff` after each implementation change. Update the plan-named tests in `src/agent/execute.test.ts`, `src/agent/model.test.ts`, `src/commands/agent.test.ts`, `src/completion/handlers.test.ts`, `src/completion/index.test.ts`, `src/plugins/context.test.ts`, and the harness and conversation tests affected by injected lookups. Confirm a disabled model is excluded in each selection path and `harness --model` retains its established refusal.

## Out of scope

- Provider fetching, catalog persistence, and manager lifecycle implementation.
- Models topic actions, models tab UI, role-card missing-model rendering, and help/user documentation.
