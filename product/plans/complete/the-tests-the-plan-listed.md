# Add the tests the plan listed and the diff does not contain

**Complexity: 3/10** — three files or additions, no production code touched.

## Goal

`product/plans/complete/sql-database-browser.md` lists a test section, and three of its items are
absent from the branch:

- `web/src/plugins/sql/StatsPanel.test.tsx` — a **new** file, covering bars scaled to the largest,
  a high-cardinality column rendering its count and no bars, a numeric column's minimum and maximum,
  and a null count of zero rendering no null row.
- `src/plugins/api-topics.test.ts` — **does not exist**. The plan asks for
  `isTabPluginNotificationTopic('databases')` to be true and for `TAB_PLUGIN_NOTIFICATION_TOPICS` to
  carry it, "so the keyed record cannot drift from the union" — which is the stated reason the record
  exists.
- `src/database/manager.test.ts` — **unchanged by the diff**, and it has no case for `listFiles()`,
  for a browser `create` landing in the same registry `db sqlite create` does, or for `readView()`
  answering the topic's read.

A plan sitting in `complete/` claiming coverage that does not exist makes the next reader believe
those areas are held in place.

## Implementation steps

1. **`web/src/plugins/sql/StatsPanel.test.tsx`** (new) — render `StatsPanel` directly, which is what
   it is a component of and keeps the test about the panel rather than the tab. The four cases above.
   Style it after `web/src/plugins/sql/SqlDrawer.test.tsx`.
2. **`src/plugins/api-topics.test.ts`** (new) — assert the two things the plan named. Read
   `TAB_PLUGIN_NOTIFICATION_TOPICS` off the exported const and check it carries `databases`, and call
   `isTabPluginNotificationTopic('databases')`.
3. **`src/database/manager.test.ts`** — add the three cases. `listFiles()` needs a database on disk,
   so create one with `runInTab('main', 'db sqlite create ...')` first, which is the shape the
   existing cases already use.

Every existing case in each of the three keeps passing unchanged.

## Spec and docs

None. This is test coverage for behavior already described in `product/specs/sql-database.md` and
`product/specs/tab-plugins.md`.

## Out of scope

- Any production change. If a case fails, that is a finding, not something to fix here.
