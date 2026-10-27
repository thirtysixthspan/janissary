# Deliver the plan's accurate database command signatures

**Complexity: 2/10** — this corrects the signatures and examples on one existing help page. The database spec and parser already require the `sqlite` engine token.

## Goal

Make `help db` show database command forms users can run successfully.

## Approach

Use `product/specs/database.md` and `src/database/parsing.ts` as the authorities for the grammar. Add the required `sqlite` token to every Usage and Examples form in `help/db.md`, preserving the page layout. Record the expected `help db` signatures in `product/specs/application-commands.md`; the database behavior spec already describes the supported forms accurately. Runtime behavior stays unchanged, so no wording-only test is needed.

## Implementation steps

1. Update the Usage and Examples blocks in `help/db.md` to show `db sqlite list`, `db sqlite create <name>`, `db sqlite delete <name>`, and `db sqlite query <name> <sql>`, with examples using supported forms.
2. Update the `help` section of `product/specs/application-commands.md` to record that `help db` documents those four forms.
3. Confirm the signatures against the database spec and parser, and run `$janissary/scripts/run.mjs check-diff` after each change.

## Tests and verification

No new automated tests are needed because command behavior does not change and a wording-only test would only pin page text. Existing database command and query coverage remains unchanged. Run `$janissary/scripts/run.mjs check-diff` and compare each documented form with the spec and parser.

## Out of scope

- Changing database parsing, execution, or query behavior.
- Changing the database grammar already recorded in `product/specs/database.md`.
- Adding tests that snapshot help wording.
- Updating unrelated help pages or documentation.
