# Correct the spec's account of what a column left alone in the insert form stores

**Complexity: 1/10** — one sentence in the spec, one test case. No behaviour changes.

## Goal

`product/specs/sql-database.md` says a column the user leaves alone in **Insert row** "is sent as
null rather than as an empty string, so it takes the database's own default". The first half is
what the code does and what the pull request's own verification step checks. The second half is not
what SQLite does: a `DEFAULT` applies to a column the statement does not name, and a column named
with an explicit null stores the null. A row saved from the form with `n INTEGER DEFAULT 7` and
`s TEXT DEFAULT 'fallback'` untouched comes back as `2 | NULL | NULL`.

The sentence's consequence is wrong, and it is wrong in a way a user acts on: a column declared
`NOT NULL` refuses the insert outright, and a `DEFAULT CURRENT_TIMESTAMP` column silently comes back
empty.

Two remedies were on the table. Sending only the columns the user filled in would deliver the
default — and would contradict the pull request's own testing step, "a column left alone is sent as
null", and would leave no way to write a null to a column the user did not type into, since the
**NULL** toggle beside it is what says "null" rather than "text". The deliberate design is the
toggle; the clause that mis-describes SQLite is the defect.

## Approach

Say what happens. A column left alone is stored as null — not as an empty string, and not as
whatever the schema declared as its default — so a `NOT NULL` column has to be filled in and a
defaulted column comes back null unless a value is typed. The sentence stays a sentence about the
difference between a blank string and a null, which is the difference the control exists for.

## Implementation steps

1. **`product/specs/sql-database.md`** — rewrite the clause so the consequence matches SQLite: the null
   is stored, and a column's `DEFAULT` applies only to a column the insert does not name, so a
   `NOT NULL` column has to be filled in and a defaulted one comes back null.

## Tests

- `src/database/write.test.ts` — beside "names only the columns it was given, so SQLite assigns the
  rest": a case that names a defaulted column with an explicit null and a case that leaves it out,
  over a table that declares a `DEFAULT`, so the two the spec now distinguishes are both pinned.
