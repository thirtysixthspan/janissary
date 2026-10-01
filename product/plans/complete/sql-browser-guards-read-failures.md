# Answer SQLite read failures in the database browser instead of throwing

**Complexity: 3/10** — contained to `DatabaseBrowser` in `src/database/browser.ts`, plus tests and a spec sentence. No new architecture.

`DatabaseBrowser` already records refused writes (`attempted`) and refused opens (`open`) as results, but its reads called into SQLite unguarded: `create` and `schema` ran `schemaObjects(handle)`, and `handleFor` (used by `query` and `exportObject`) ran `hasObject` and `objectColumns` before any try. Opening a file that is not an SQLite database, or one another process holds locked, succeeds — the first `prepare` is what throws. These run inside the sql plugin's guarded call (`topicAction` → `runTopicAction` → `actOnDatabases`), and `invokePlugin` (`src/plugins/invoke.ts`) treats any non-rejection throw as the plugin failing, so one bad `.sqlite` file disabled the sql plugin and closed every SQL tab.

## Goal

Every database-browser read answers with a result carrying the SQLite error — a schema answer with no objects, a query answer with an empty grid, an export answer — exactly as a refused open already does, so the plugin is never blamed for the file.

## Approach

1. `handleFor` wraps `hasObject` and `objectColumns` in a try and returns `{ error }` on a throw; `query` and `exportObject` already handle that branch.
2. `create` and `schema` read the object list through a new private `schemaRead(requestId, database, handle)` that returns the error as a schema result on a throw.

## Decision: no blanket catch in `runTopicAction`

The backlog entry also suggested catching every throw in `runTopicAction` as defense in depth. `invokePlugin` turns such a throw into a plugin failure for every topic, not just databases, and some topics throw deliberately — `ConversationsManager.create` throws when no conversation models are configured. Swallowing those would leave the plugin carrying on (opening a tab for a conversation that was never created) with only a log line. That is a behavior change across three other topics and out of this item's scope; the targeted guards fix the failure the entry describes.

## Tests

`src/database/browser.test.ts`, "a database file that is not a database": a schema read, a create, a grid query, and an export against a file of plain text each record an answer carrying the "not a database" error and do not throw. The existing refused-write cases keep passing.

## Out of scope

- Host-side containment of throws from other topic sources.
- A user-facing hint for a locked database beyond the SQLite error text.
