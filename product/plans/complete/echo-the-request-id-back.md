# Echo the plugin's request id back on the answer

**Complexity: 4/10** — one parameter threaded through four modules and the tests that assert on it. No new architecture and no new behavior beyond the answer carrying the id that asked for it.

## Goal

`topicAction` is fire-and-forget, so a `databases` answer can only arrive on the next topic
notification, and the plugin tells answers apart by the `requestId` that rode out with the request.
The plugin mints that id with `randomUUID()` and records it as `payload.pending.id`. The host
discards it: `actOnDatabases` in `src/plugins/topics.ts` calls each `browse*` method with no id at
all, and every `browse*` method on `DatabaseManager` mints a fresh one from a host-side counter.
The answer therefore carries `q7` while the tab is waiting on a UUID, `resultFor` in
`src/plugins/sql/tabs.ts` never matches, and `deliver` in `src/plugins/sql/activate.ts` re-issues
forever. No schema, page, statistics read, or write result ever reaches a tab.

Three places already describe the intended contract and are all currently wrong about the host:
`product/plans/complete/sql-database-browser.md` ("the host echoes it rather than issuing it"),
`ai/guidelines/plugins-tabs.md`, and `documentation/developer-documentation/tab-plugins.md`. This
plan makes the code match what all three say.

## Approach

Thread the caller's id through rather than minting a second one. The plugin is the only party that
knows what it is waiting for, and a `randomUUID()` from two plugins on one topic cannot collide,
which is exactly why the host should not be minting ids at all.

## Implementation steps

1. **`src/plugins/topics.ts`** — `actOnDatabases` passes `action.requestId` to all nine
   `browse*` calls. Each action is discriminated on `topic: 'databases'`, so every arm has the
   field.
2. **`src/database/manager.ts`** — each `browse*` method takes `requestId: string` as its second
   parameter and forwards it. Delete the private `requestId()` helper, and correct the comment above
   `readView()`, which currently says each browse method mints its own.
3. **`src/database/browser.ts`** — delete `DatabaseBrowser.requestId()`. Every other method already
   takes the id as a parameter and already stamps it on the result it records, so nothing else
   changes.
4. **`src/database/browser-state.ts`** — delete `DatabaseBrowserState.requestId()` and its `next`
   counter, and rewrite the module comment to say the id is minted by the plugin and echoed, which
   is what the remaining `record`/`results` exist for.

## Tests

- `src/plugins/topics.test.ts` — the existing routing case asserts `browseQuery` was called with
  `('shop', query)`; change all nine assertions to carry the id each action was sent with. Add a
  round-trip case in a new `describe` that builds a real `DatabaseManager` against a temporary
  project directory, routes a `create` and then a `schema` action through `runTopicAction`, and
  asserts `readView().results` carries the exact id that was sent. This is the assertion neither
  suite has today, and it is the one that fails on the defect. A test file is exempt from the plugin
  import boundaries, so the real manager may be imported here.
- `src/database/browser.test.ts` — `seeded` and every case mint ids with `browser.requestId()`;
  replace those with literal ids. Drop the `DatabaseBrowserState` case that asserts the state mints
  unique ids, and the one that asserts the cap by comparing against a generated id, rewriting the
  latter with literal ids so it still pins the cap.

## Out of scope

- Re-issuing. `deliver`'s existing recovery for a lost answer stays as it is; it is correct once
  answers are addressed properly, and it is now reachable only for a genuinely evicted answer.
- The `run` action's `followUp: 'console'` value, which `deliver` collapses to a schema re-issue.
  A real defect, but a different one from this and small beside it.
- `ai/guidelines/plugins-tabs.md` and `documentation/developer-documentation/tab-plugins.md`. Both
  already say the host echoes the id, so this change makes them true. Re-read them afterwards and
  leave them alone unless the shape that lands differs from what they describe.
