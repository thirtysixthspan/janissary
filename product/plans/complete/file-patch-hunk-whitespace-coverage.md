# Cover added hunk line whitespace

**Complexity: 1/10** — test-only coverage with no production changes or units (p=1.58)

## Goal

Verify that parsing an added hunk line preserves its leading and trailing spaces and tabs.

## Approach and implementation

Extend the existing whitespace preservation case in `src/file-patch/parse-hunks.test.ts` with an added line containing spaces and tabs at both ends, asserting its exact text after removing the prefix. Retain the existing context, removal, and empty-line assertions.

## Tests and verification

Run the parser tests and diff-scoped checks.

## Out of scope

Production behavior and user-facing documentation are unchanged.
