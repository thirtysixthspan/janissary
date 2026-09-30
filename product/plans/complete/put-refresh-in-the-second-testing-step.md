# Put **Refresh** in the second testing step, where the schema is re-read

**Complexity: 1/10** — one clause of the pull request's own description. No code, no test, no spec.

## Goal

The description's second **How to verify** step ends its first sentence with pressing **Refresh**, and
its next sentence — adding a `CREATE VIEW`, a `CREATE INDEX` and a `CREATE TRIGGER` through the
console and confirming each appears under its own group — does not. A reader following the step exactly
watches the navigator stay at `Tables` and reports the pull request as missing two of the three object
kinds, when all three are present and one more press of **Refresh** shows them.

## Approach

The app is right and the step is what is wrong: `product/specs/sql-database.md` states that "the schema
is re-read only when a `Refresh` is pressed", and a schema read is what turns a created object into a
navigator entry. So this is a correction to the step, not a change to the behaviour.

One clause, in the same words the step's first sentence already uses. Nothing else in the description
moves: the **Behavior examples** sketch and the **Files changed** list drift in the same direction and
were named out of scope by the branch's own `sql-pr-description-verification-steps.md`, and the rest of
the description is the author's statement of intent.

The description is edited after the commit is pushed, never before, so it never describes a branch that
does not carry the change. The title is untouched: it has to match the commit subject.

## Implementation steps

1. `product/plans/complete/put-refresh-in-the-second-testing-step.md` — this plan.
2. `product/backlog/pull-request.md` — the entry removed, and the file restored to its
   comment-and-heading skeleton, since this is the last entry on it.
3. The pull request's description, with **Refresh** added to that second sentence.

## Tests

None. Nothing in `src/` or `web/src/` changes, so `check-diff` has nothing to run for it; what this
entry is worth is the step becoming followable, which is what the description edit is for.
