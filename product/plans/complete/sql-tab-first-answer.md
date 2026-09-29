# Make the SQL tab render the answer it asked for, and stop it disabling itself on the next one

**Complexity: 3/10** — the fix is an ordering guarantee in three functions in one plugin, plus a
new small module to hold the request plumbing that ordering depends on. No wire change, no contract
change, no client change, no new dependency. The risk is entirely in whether the ordering holds on
every path that issues a request, which is why the plan routes all four of them through one helper
rather than fixing `openDatabase` alone.

## Goal

Every request the plugin sends is recorded in the tab's own mirror **before** it leaves for the host.
Today two paths do the opposite, and the consequences are that a `sql <name>` tab never leaves
`Loading…` / `No tables.` and the next topic action on it — a press of **Refresh** — recurses until
the stack overflows and the host disables the plugin for the rest of the session.

## Approach

`capabilities.topicAction` is synchronous all the way down: it reaches `runTopicAction` in
`src/plugins/topics.ts`, whose `actOnDatabases` runs the manager method, records the answer, and then
calls `messageBus.emit('databases', …)`. `emit` in `src/bus.ts` walks its listeners inline, the
only listener is `dispatch` in `src/plugins/notifications.ts`, and `dispatch` calls
`activation.notify` through `guardPluginCall`, which runs the handler before its first `await`. So an
answer is delivered — and this plugin re-enters its own `notify` — **before `topicAction` returns**.

That makes the mirror write the load-bearing part of a request, and two paths get it wrong:

1. `deliver` in `src/plugins/sql/activate.ts` calls `fold`, and `foldSchema` calls `issue('query', …)`
   from inside it. The re-entrant `deliver` therefore reads the mirror as it was *before* the fold,
   finds the schema answer it just consumed still sitting in the capped result list, folds it a
   second time, and issues another query — with the same stale mirror again. Unbounded synchronous
   recursion, a `RangeError`, and `disable` in `src/plugins/host.ts`.
2. `openDatabase` in `src/plugins/sql/open-tab.ts` calls `issue('schema', …)` before
   `tabs.write(key, payload)` and before `openOrFocusTab`. The notification is emitted while
   `ownedTabs` in `src/plugins/notifications.ts` is still empty, so `dispatch` drops it. The tab is
   left awaiting a request id nothing will ever answer — which is why the empty-database case looks
   the same as the full one and also never recovers.

The fix splits "ask the host for something" from "send that ask", and makes sending the second step
of a helper that has already written the mirror:

- **`src/plugins/sql/request.ts` (new)** — everything about a request except sending it.
  `SqlRequest` pairs a `SqlPending` with the `TabPluginTopicAction` that will answer it;
  `planRequest` / `planRun` / `planFor` build one; `dispatch` is the single place that sends, and it
  writes the payload carrying the request into the mirror, publishes it to the tab, and only then
  calls `capabilities.topicAction`. The doc comment states the ordering invariant and why it exists,
  so the next request-issuing path inherits it rather than re-deriving it.
- **`src/plugins/sql/tabs.ts`** — `newRequestId`, `gridQueryOf`, `issue` and `issueRun` move to
  `request.ts`. What stays is tab state: the payload seed, the object picker, the log and export
  helpers, `resultFor`, and the `SqlTabs` mirror itself. It also drops under the 200-line limit by
  roughly fifty lines.
- **`src/plugins/sql/fold.ts`** — `fold` stops issuing. It returns `{ payload, followUp }` where
  `followUp` is a planned-but-unsent `SqlRequest` (a `query` after a schema answer and after a
  write) or `null`. The `capabilities` parameter goes away with it, which is the point: folding an
  answer no longer performs I/O.
- **`src/plugins/sql/activate.ts`** — `deliver` gains a `publish` helper (the `updateTab` call plus
  the mirror write-back that captures export registration) and routes all three of its branches
  through `dispatch`: the fold's follow-up, the re-issue of a lost answer, and the plain
  no-pending case.
- **`src/plugins/sql/open-tab.ts`** — opens and focuses the tab, writes the mirror, and only then
  sends the schema request.
- **`src/plugins/sql/intents.ts`** — `apply` takes an optional planned request, writes the mirror,
  updates the tab, then sends. The three grid write intents use `planFor` with their own action
  rather than minting an id and calling `topicAction` themselves.

A re-entrancy guard in `notify` is deliberately **not** added: the re-entrant delivery is what
delivers a follow-up's answer, and skipping it would leave the tab waiting on exactly the request
nobody would answer. With the ordering fixed the chain converges instead — schema answer folds, one
query is issued, its answer arrives on the re-entrant delivery and folds with no follow-up, and the
tab converges in one topic round trip rather than two.

## Implementation steps

1. Add `src/plugins/sql/request.ts`: `SqlRequest`, `newRequestId`, `gridQueryOf`, `planRequest`,
   `planRun`, `planFor`, and `dispatch`, with the ordering invariant documented on `dispatch`.
2. Remove those five symbols from `src/plugins/sql/tabs.ts`; move `SqlRequest` imports to
   `request.ts` in `fold.ts`, `activate.ts`, `open-tab.ts`, `intents.ts`.
3. `fold.ts`: return `{ payload, followUp }`, drop the `capabilities` parameter, return `null`
   follow-ups from the `query`, `stats` and `export` branches.
4. `activate.ts`: extract `publish`, and route the fold, the re-issue, and the no-pending branch
   through `dispatch`.
5. `open-tab.ts`: write the mirror and open the tab before sending.
6. `intents.ts`: `apply` gains the optional request; `reread`, `set-page`, `refresh`, `run`, `stats`,
   `export` and the three write intents plan through `request.ts`.
7. Tests.

Run `./scripts/run.mjs check-diff` after each step.

## Tests

In `src/plugins/sql/activate.test.ts`, a new `reentrant` fixture alongside the existing one. The
existing fixture's `topicAction` only records the action, so it cannot see the bug at all — this one
reproduces the host: it records the answer into the topic data and then calls `activation.notify`
synchronously from inside `topicAction`, and it delivers nothing while the plugin owns no open tab,
mirroring the `ownedTabs` filter in `dispatch`. Without that second rule the `openDatabase` ordering
bug is invisible, because a fake that notifies unconditionally answers a request no tab is waiting
for.

- `sql <name>` against a database with a table leaves the tab showing that table's first page: the
  navigator lists `orders`, the payload's `pending` is `null`, `grid` has rows, and exactly two
  actions were sent (`schema` then `query`). Before the fix this recurses and throws a `RangeError`.
- `sql <name>` against a database with no tables leaves `objects` empty and `pending` `null` — the
  request is answered rather than left outstanding. Before the fix the payload still carries the
  schema request id and the tab would wait forever.
- **Refresh** on an open tab sends a `schema` request and lands back on a page with `pending` `null`,
  which is the action the backlog reports as the trigger for `Maximum call stack size exceeded.`
- Folding the same non-empty schema answer twice converges: the mirror is read with the follow-up's
  request id already recorded, so the second delivery folds the query answer instead of the schema
  answer. Asserted by the first case's action count, which is the observable form of it.
- The existing re-issue case keeps passing: a delivery whose answer never arrived sends exactly one
  replacement `schema` request, and the mirror records it before it goes.

## Out of scope

- The `export` control the tab does not render (`web/src/plugins/sql/SqlTab.tsx` sends no `export`
  intent), which is the second entry in the branch's own backlog.
- The plan's stale three-column count in `sql-database-browser.md`'s Verification section, the third
  entry.
- Any change to the client, the wire protocol, `TAB_PLUGIN_API_VERSION`, or the `databases` topic
  contract. The plugin's public surface is unchanged; only the order of two internal calls is.
