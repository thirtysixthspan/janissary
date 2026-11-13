# Refuse an ill-formed edit oldString

**Complexity: 1/10** — 1 edited guard line, 1 new test, 1 plan bullet update; a single pure function with no callers yet.

Source: PR #1996 backlog entry "Handle an edit whose old text is a lone surrogate".

## Goal

`replaceExactText` must never split a surrogate pair. A lone low or high surrogate in `oldString` matches half of an astral character, so replacing it leaves an unpaired surrogate that plan 6b would write as U+FFFD.

## Approach

Refuse an `oldString` that fails `isWellFormed()` with `NO_MATCHING_TEXT_REASON`, in the same guard as the empty-`oldString` check, before counting matches. A well-formed `oldString` cannot split a pair in well-formed text.

## Implementation steps

1. In `src/file-write/edit-text.ts`, extend the empty-`oldString` guard in `replaceExactText` with `!oldString.isWellFormed()`.
2. Update the design-decision bullet and check order in `product/plans/complete/janissary-hosted-agent-write-tool-6a-edit-text-replacement.md` to state the new rule.

## Tests

- `src/file-write/edit-text.test.ts`, "replaceExactText matching": text containing U+1F600 (built with `String.fromCodePoint`) with `oldString` U+DE00 is refused with `NO_MATCHING_TEXT_REASON`.

## Out of scope

- Callers of `replaceExactText` (plan 6b) and any change to `checkEditReplacement`.
