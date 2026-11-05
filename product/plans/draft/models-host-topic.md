# Models host topic

**Complexity: 4/10** — this adds one bounded server-to-plugin state topic and three validated actions by extending the existing topic registry.

## Goal

Expose the model catalog manager through an additive `models` tab-plugin topic so the forthcoming models and roles plugins can read, reload, refresh, and delete catalog entries through declared host capabilities.

## Decisions and dependencies

- Depends on `models-catalog-manager.md` and `models-catalog-consumers.md`.
- The topic contains only the manager's visible grouped view and `refreshing` flag. Actions are `reload`, `refresh`, and `delete`; a refused Delete returns the manager's refusal string.
- Add a new topic-specific module because the current `src/plugins/topics.ts` has no room under the 200-line source limit. Keep `TAB_PLUGIN_API_VERSION` unchanged because this is additive.
- Keep topic reads and writes behind the declared notification topic contract; plugins receive no `Managers` object or direct file access.

## Existing code to reuse

| Need | Existing code |
| --- | --- |
| Topic unions and guards | `src/plugins/api-topics.ts` and `src/plugins/api-topics-connections.ts` |
| Topic source registration | `src/plugins/topics.ts` and `src/plugins/connections-topic.ts` |
| Manager and typed signal | `managers.models` and the `models:changed` bus event |
| Topic behavior tests | `src/plugins/topics.test.ts` and `src/plugins/api-topics.test.ts` |

## Proposed changes

1. Add `src/plugins/api-topics-models.ts` with the notification variant and the three `models` topic actions. Join these types into the existing unions and `NOTIFICATION_TOPICS` in `src/plugins/api-topics.ts`.
2. Add `src/plugins/models-topic.ts` as the topic source. It subscribes to `messageBus.on('models', 'changed', ...)`, returns `managers.models.view()`, and routes each action to the manager.
3. Register the new source in `src/plugins/topics.ts`, keeping that file below the max-lines limit by extracting only the topic-specific implementation.
4. Extend topic and guard tests to cover view reads, subscription, reload, refresh, Delete success/refusal, and topic recognition.
5. Update `product/specs/tab-plugins.md` and `ai/guidelines/plugins-tabs.md` from seven to eight host topics, describing the models slice and its `refreshing` flag. Update the documentation consistency test if its expected topic count is fixed.

## Tests and verification

Run `$janissary/scripts/run.mjs check-diff` after each implementation change. Verify existing topic sources continue to pass their subscription and action tests.

## Out of scope

- A concrete plugin declaration, command, client component, or models-specific UI.
- Roles-tab behavior or catalog format/provider changes.
- A tab-plugin API version bump.
