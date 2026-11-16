# Cover patch parser error line numbers

**Complexity: 1/10** — test-only coverage; no production changes or units (p=1.58)

## Goal

Verify each planned parser error reports its exact line and text with and without a leading envelope.

## Approach and implementation

Extend the existing parameterized parser error cases in `src/file-patch/parse.test.ts` to run each applicable input both plain and with a leading Begin Patch marker, asserting the literal expected error and the offset line number. Keep empty and envelope-only no-section cases separate because their error always names line 1.

## Tests and verification

Cover unknown markers, missing paths, misplaced moves, and invalid Add lines, including the specific cases named in the completed parser plan. Run the parser tests and diff-scoped checks.

## Out of scope

Production parser behavior and user-facing documentation are unchanged.
