# Guard an insert against the object the tab is showing

**Complexity: 2/10** — one guard signature, one equality check, and two test cases. No new module and
no change to the write layer, which is correct as it stands.

## Goal

The `insert-row` intent in `src/plugins/sql/intents.ts` calls `requireWritable(payload, ...)`, which
resolves the object as `payload.object` — the table the grid is showing — and then sends
`object: value.object` in the topic action. The table the guard checked and the table the server
writes to are therefore only the same when the client is honest, so a request naming a different
writable table inserts into a table the view never showed and never re-reads: the insert succeeds and
the grid does not change, which reads as the browser losing a write.

`update-cell` and `delete-row` do not have this shape, because they name a row key rather than a
table — the key resolves to the table server-side. `insert-row` is the only action that takes a table
name from the client at all, so it is the only one that needs the check.

## Approach

Give `requireWritable` the object name it is guarding, and have it also require that the name is the
one the tab is showing. Checking a name against the payload *and* the payload's own selection closes
the gap in one step: the action cannot name a table the tab is not on, and the writability check
still runs against that same table.

Refusing a mismatch outright is deliberate. Silently substituting the payload's object would make an
insert land somewhere the request did not ask for, which is the same class of surprise as the bug.

## Implementation steps

1. **`src/plugins/sql/intents.ts`** — add an `object: string` parameter to `requireWritable`, look
   the entry up by that name rather than by `payload.object`, and reject with
   `invalid insert-row object` when it is not `payload.object` before the writability check runs, so
   the message names the mismatch rather than reporting a read-only table that was never involved.
   Call it with `value.object` from the `insert-row` entry. `update-cell` and `delete-row` pass
   `payload.object`, which is what they already act on, and their messages stay as they are.
2. **`src/plugins/sql/activate.test.ts`** — a case that an insert naming a different object is
   rejected and issues no action, and a case that an insert naming the shown writable object still
   issues `insertRow`. The existing read-only refusal must keep passing unchanged.

## Tests

`src/plugins/sql/activate.test.ts` gains two cases. The first sends `insert-row` with an `object`
that is not the payload's, on a payload whose shown object *is* writable, and asserts both the
rejection message and that no action reached the host — the writable payload is the point, since a
read-only one would be refused anyway and prove nothing. The second sends it with the shown object
and asserts the `insertRow` action carries that name.

## Out of scope

- Changing the write layer. `src/database/write.ts` takes the table name the action carries, and it
  has no way to know what a tab is showing — that check belongs where the tab is, which is the plugin.
- Removing the name from the action entirely. A row key cannot name a row that does not exist yet, so
  an insert has to name its table; the check is what makes that safe.
- The other three actions. They name a row key the server resolves, and are unaffected.
