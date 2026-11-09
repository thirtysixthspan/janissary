# Centralise awaited topic action handling and remove the RunTopicAction cast

**Complexity: 3/10** — a mechanical refactor of three call sites with no behavior change; the existing topic and capability tests cover each path.

`src/plugins/topics.ts` exported `runTopicAction = runTopicSourceAction as RunTopicAction`, erasing the overload relationship through a type assertion, and the knowledge that `models/delete` and `commands/set` are awaited was repeated as `topic === ... && action === ...` branches for the disabled-plugin case in `context.ts` and `file-capabilities.ts`.

## Goal

One declared place says which topic actions are awaited and what a disabled plugin gets back for them, and `runTopicAction` carries real overloads instead of a cast. Adding an awaited action becomes a single edit.

## Approach

1. In `src/plugins/api-topic-action-capability.ts`, add `isAwaitedTopicAction` (a type guard to `AwaitedTabPluginTopicAction`) and `disabledTopicActionResult`, which returns `Promise.resolve(undefined)` for an awaited action and `undefined` otherwise. Remove the `RunTopicAction` interface.
2. Use `disabledTopicActionResult` from `topicActionCapability` in `src/plugins/context.ts` and `src/plugins/file-capabilities.ts`, and use `AwaitedTabPluginTopicAction` in their overloads.
3. In `src/plugins/topics.ts`, replace the cast with overloaded `runTopicAction` declarations, moving `subscribeTabs` into `src/plugins/tabs-topic.ts` to stay under the 200-line limit.

## Tests

- `src/plugins/api-topic-action-capability.test.ts`: the guard and the disabled result for each awaited and non-awaited action.
- Existing `topics.test.ts`, `api-topics.test.ts`, and `context.test.ts` pass untouched.

## Out of scope

Merging the two duplicated `topicActionCapability` factories and `requireDeclaredTopic`.
