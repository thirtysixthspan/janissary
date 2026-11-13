# Pin the mutation path display helper's paragraph separator escape with a test

**Complexity: 1/10** — test-only change, 0 production lines or files, 1 requirement, 1 scenario (p=2.32).

Source: PR #1996 branch backlog entry "Pin the path display helper's U+2029 escape with a test". Follows `./product/plans/complete/mutation-path-display-escape-bidi-controls.md` and `./product/plans/complete/janissary-hosted-agent-write-tool-2a-contract-and-messages.md`, which introduced `displayPath`.

## Goal

`displayPath` in `src/file-write/messages.ts` already escapes U+2029 (paragraph separator) through the `code === 0x20_29` comparison in `isEscapedCode`, but the colocated tests assert only U+2028. A later edit that dropped or narrowed that comparison would let a paragraph separator break an outcome line with no test failing. Add an assertion so every line-breaking code point the helper escapes is pinned.

## Approach

Extend the existing `displayPath` test that escapes line breaks, tabs, and control characters, rather than adding a separate case, so the line-breaking set stays in one place. Build the character from a numeric code point constant, as the U+2028 case already does, so the test source carries no raw separator character.

## Implementation steps

1. In `src/file-write/messages.test.ts`, add `PARAGRAPH_SEPARATOR_CODE = 0x20_29` beside `LINE_SEPARATOR_CODE`.
2. Append it to the code list in the "escapes line breaks, tabs, and control characters onto one line" case, and append the matching `u${PARAGRAPH_SEPARATOR_CODE.toString(16)}` escape to its expected escapes list.

No production code changes.

## Tests

- The extended case asserts a path containing U+2029 renders it as the six-character escape (backslash, `u`, `2029`) alongside the existing escapes.
- Mutation check: temporarily removing the `0x20_29` comparison from `isEscapedCode` makes the case fail; restore it afterwards.

## Specs and documentation

No functional spec or help page describes the write and edit outcome lines yet; no spec or documentation change.

## Out of scope

- Any change to `src/file-write/messages.ts`.
- Escaping further code points.
