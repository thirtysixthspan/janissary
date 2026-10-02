# Derive the multi-agent payload's clone-in-flight count

**Complexity: 2/10** — drop a stored field and compute it where the payload is already being read. Three files change and no behavior outside the summary line moves.

## Goal

The summary above a multi-agent tab's rows reports how many clones are still in flight, and that number never changes.

`MultiAgentRun.cloning` is written once, by `cloningCount(members)` at the moment `MultiAgentManager.run` builds the tab's payload, and `buildTabView` in `src/tab/view.ts` passes `tab.multiagent.cloning` through untouched. Nothing recomputes it as members leave the `cloning` state, so a finished run keeps reporting that its clones are still cloning for the life of the tab.

The count is not state — it is a function of the member states the payload already carries and the projection already reads. Storing it created a second copy that can disagree with the first.

## Approach

Compute the count at projection time from the members being projected, and stop storing it. The wire type keeps its `cloning` field, so `web/src/multiagent/format.ts`'s `runSummary` and everything else in the client is untouched.

## Implementation steps

1. In `src/multiagent/types.ts`, remove the `cloning` field from `MultiAgentRun` and remove the `cloningCount` helper, which exists only to feed that field.
2. In `src/multiagent/manager.ts`, stop computing `cloningCount(members)` when building the tab's payload, and drop the now-unused import.
3. In `src/tab/view.ts`, derive the count in the `multiagent` branch of `buildTabView` from the projected members. Put the helper beside the other small pure helpers at the bottom of that file rather than inline in the branch, so the projection stays a projection.
4. Keep the projection field-by-field as it is — the point of that shape is that a new field on the server record cannot start broadcasting itself, and a spread would undo it.

## Tests

- In `src/tab/view.test.ts`, a payload whose members have moved past `cloning` projects a count of zero rather than the value the payload was created with. No existing test pins the count's freshness, so this is the case that would have caught it.
- In `src/tab/view.test.ts`, a payload with members still cloning projects that number.
- Update the existing `multiagent` projection case in `src/tab/view.test.ts`, whose payload carries `cloning: 1`, to build its payload without the field and expect the derived value.
- Update `src/multiagent/manager.test.ts`, whose tab doubles assert on payload shape, so nothing references the removed field.

## Out of scope

- **Broadcasting the settled state**, which is a separate fix already landed.
- **Any change to the client.** `runSummary` reads `view.cloning` and keeps working; the field is still on the wire, only its source moved.

## Verification

```
./scripts/run.mjs check-diff
```

Then, with the app running: start a two-model `fanout` and confirm the summary reads `0 of 2 answered · 2 cloning` while the clones are in flight, drops the cloning clause once they land, and settles on `2 of 2 answered`.
