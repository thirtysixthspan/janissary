# Models host topic

**Complexity: 4/10** — this adds one bounded server-to-plugin state topic, an async refusal path for its queued Delete action, and type, registry, and documentation wiring.

## Goal

Expose the model catalog manager through an additive `models` tab-plugin topic so the forthcoming models and roles plugins can read, reload, refresh, and delete catalog entries through declared host capabilities.

## Decisions and dependencies

- Depends on the completed `product/plans/complete/models-catalog-manager.md` and `product/plans/complete/models-catalog-consumers.md`.
- Define the notification data as the manager's visible grouped view, `{ groups: ModelGroup[]; refreshing: boolean }`. Hidden records are absent; disabled visible records remain present with `disabled: true`. The topic's empty value is `{ groups: [], refreshing: false }`.
- Define exactly three actions: `reload` with no fields, `refresh` with no fields, and `delete` with `harness` and `id` strings. `reload` calls the synchronous manager reload and returns `undefined`. `refresh` starts `managers.models.refresh()` without awaiting provider work; its final outcome arrives through the later `models:changed` notification and `models-refresh` event. `delete` awaits the manager's queued write and returns its refusal string, if any; write failures are reported by the manager notification and are not action refusals.
- Preserve the synchronous return type of all existing `topicAction` actions while giving only `models/delete` an asynchronous `Promise<string | undefined>` result. Use an action-specific overload on the server capability; let `TopicSource.act` and `runTopicAction` carry the sync-or-promise result, and make the forthcoming Models delete intent await it before calling `rejectRequest`. This is required because `ModelCatalogManager.delete` is queued and returns a promise.
- Keep `TAB_PLUGIN_API_VERSION` unchanged: this adds a notification topic and topic-specific actions, leaves every existing action's behavior and synchronous result unchanged, and adds the promise result only to the new Delete action.
- Put the model action/data types and source behavior in topic-specific modules, following the existing `api-topics-connections.ts` and `connections-topic.ts` split. `topics.ts` and `api-topics.ts` currently remain under the actual 200 nonblank, noncomment line limit; the split is for clear topic ownership, not because either file is already over the limit.
- Topic data and actions remain behind `notifications: ['models']` plus the declared `topicData` and `topicAction` capabilities. A subscribing plugin must also implement `notify`, as `validateActivation` requires at `src/plugins/activate.ts:63-70`. Reuse `createPluginContext`'s declaration checks; plugins receive no `Managers` object or direct file access. The action union is a compile-time contract; `createPluginContext` enforces the declared topic at runtime.

## Existing code to reuse

| Need | Existing code |
| --- | --- |
| Topic unions and notification guard | `TabPluginNotificationTopic`, `TabPluginNotification`, `TabPluginTopicAction`, `NOTIFICATION_TOPICS`, and `isTabPluginNotificationTopic` in `src/plugins/api-topics.ts:24-43`; topic-specific types in `src/plugins/api-topics-connections.ts:4-21` |
| Topic source contract and registration | `TopicSource`, `TOPIC_SOURCES`, and `runTopicAction` in `src/plugins/topics.ts:20-24,152-220`; the topic-owned `readConnectionsTopic`, `runConnectionsTopicAction`, and subscription split in `src/plugins/connections-topic.ts:19-37` |
| Declared topic/capability checks | `requireDeclaredTopic` in `src/plugins/context.ts:58-65` and the `topicData`/`topicAction` wrappers at `src/plugins/context.ts:161-168`; `validateActivation` requires `notify` for declared topics at `src/plugins/activate.ts:63-70` |
| Public server capability type | `TabPluginServerCapabilities.topicAction` in `src/plugins/api.ts:289` and its topic-type re-exports at `src/plugins/api.ts:36-39`; keep existing action calls synchronous and add an overload for the new asynchronous action |
| Manager view, actions, and signal | `ModelCatalogManager.view`, `reload`, `refresh`, and queued `delete` in `src/models/manager.ts:57-110`; typed `models:changed` event in `src/bus.ts:195` |
| Topic and API guard tests | Source and subscription tests in `src/plugins/topics.test.ts`; name union/guard tests in `src/plugins/api-topics.test.ts` |
| Documentation count check | `src/plugins/documentation.test.ts:65-75`, which derives the expected count from `TAB_PLUGIN_NOTIFICATION_TOPICS` and checks the developer documentation, product spec, and guideline |

## Proposed changes

1. Add `src/plugins/api-topics-models.ts` with the `ModelsTopicNotification` variant, whose data is `{ groups: ModelGroup[]; refreshing: boolean }` and whose `tabs` field is `readonly string[]`, and the `ModelsTopicAction` union. Reuse the exported `ModelGroup` type from `src/models/groups.ts:5`; define the three exact action shapes above. Join the notification and action types into the unions and append `models` to `NOTIFICATION_TOPICS` in `src/plugins/api-topics.ts`, preserving the current order of all existing topics. Re-export the topic-specific types from `src/plugins/api.ts`, as it does for connection-topic types. Add no runtime action validator; the discriminated union provides the compile-time shape and the existing context enforces the declared topic.
2. Add `src/plugins/models-topic.ts` with the `models` source functions/object used by `TopicSource`: subscribe through `messageBus.on('models', 'changed', fire)`, read `managers.models.view()`, and supply the empty view. Route `reload` synchronously, launch `refresh` with `void managers.models.refresh()`, and return the promise from `managers.models.delete(harness, id)` so the refusal `no model "<harness> <id>"` is available to the Models intent.
3. Update `TopicSource.act` and `runTopicAction` in `src/plugins/topics.ts` to carry either the existing synchronous `string | undefined` result or the promise result for `models/delete`. Give `TabPluginServerCapabilities.topicAction` an action-specific overload with the `models/delete` overload first, so this new action is awaitable while all existing action call sites retain synchronous results. Make the `createPluginContext` wrapper preserve that action/result correlation. Keep the notification topic source table as the registration point and under the 200 nonblank, noncomment line limit; keep topic-specific action logic in `models-topic.ts` rather than growing the table with another branch.
4. Extend `src/plugins/api-topics.test.ts` to append and recognise `models` while still rejecting unknown names. Extend `src/plugins/topics.test.ts` to assert the exact empty/read view, event subscription and unsubscription, declared-topic denial for both `topicData` and `topicAction`, synchronous reload, fire-and-forget refresh, and awaited Delete success and refusal. Keep existing topic action return behavior covered for schedules and connections; assert those actions still return synchronously.
5. Update `product/specs/tab-plugins.md`, `ai/guidelines/plugins-tabs.md`, and `documentation/developer-documentation/tab-plugins.md` to describe eight v3 topics and the models slice (`groups` plus `refreshing`). In the developer page, update the current v3 inventory and action description; keep the v3 history clear that `models` is an additive topic and not an API-version bump. Document the three models actions, including that Delete can return an asynchronous manager refusal while existing synchronous actions retain their result shape. `src/plugins/documentation.test.ts:66-70` derives the topic count dynamically and checks all three documents; update those documents and keep the test passing without hard-coding a new count in the test.

## Tests and verification

Run `$janissary/scripts/run.mjs check-diff` after each implementation change. Verify existing topic sources continue to pass their subscription and action tests, including that their action results remain synchronous. The later Models tab subplan supplies the end-to-end client flow; during final feature acceptance, verify an open Models tab receives the initial view, repaints on `models:changed`, and displays the manager refusal for a stale Delete.

## Out of scope

- A concrete plugin declaration, command, client component, or models-specific UI.
- Roles-tab behavior or catalog format/provider changes.
- A tab-plugin API version bump.
