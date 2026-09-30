# Stop the specs contradicting the foreign-key control they describe

**Complexity: 1/10** — two sentences of prose. No code, no test, no behaviour change.

## Goal

`product/specs/sql-database.md` describes the foreign-key control in its filtering section —
"Activating it selects that table filtered to the value" — and then lists "It does not join tables,
follow a foreign key, or build a query." under "What it does not do". `product/specs/database.md`
advertises the browsing surface as offering "per-column statistics, the SQL behind the current view",
neither of which this branch builds and both of which `product/specs/sql-database.md` already rules out
in its own words.

## Approach

Prose only, and the behaviour is already right: the pull request's own fifth testing step observes the
key cell titled `orders.id`, and activating it shows the referenced table filtered to that value.

So this is the spec catching up with the code rather than the other way round. The foreign-key clause
comes out of the "does not do" list, which keeps its joins and query-builder half — the grid is still
one object at a time and still has no query builder. The "does" list gains the clause, so the two
sections agree and a reader who goes looking for the control finds it named.

`product/specs/database.md` loses the two phrases its sibling spec contradicts, leaving the sentence
about the surface being a browser beside the command rather than a replacement for it.

## Implementation steps

1. `product/specs/sql-database.md`, **What it does not do**: drop the foreign-key clause; add the
   following clause to the same list's neighbour, the section that already describes the control.
2. `product/specs/database.md`, **Browsing a database**: drop "per-column statistics, the SQL behind
   the current view" from the list of what the browser offers.

## Tests

None. Nothing in `src/` or `web/src/` changes, so there is nothing to run; what this entry is worth is
that the two sections of the spec stop disagreeing, which no test asserts and no test should.

## Out of scope

- `product/backlog/pull-request.md` itself, whose description-adjacent wording is the author's
  statement of intent and is not this entry's to change.
- The `4 col` gutter and the `[<>]` / `[📊]` glyphs in the pull request description's **Behavior
  examples** sketch, which drift in the same direction and are a description edit belonging to the
  step-correction entry rather than to this one.
