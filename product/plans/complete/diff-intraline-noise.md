# Diff Intraline Noise

Complexity: 3/10

## Goal

Avoid character-level highlights for substantially different long replacements while retaining useful marks for short edits within a shared line structure.

## Approach

Raise the minimum shared-character ratio used by the existing bounded LCS matcher. Keep the line-level added and removed backgrounds unchanged, and verify the reported prose and parameter examples.

## Implementation steps

1. Tighten the shared-content threshold and add tests for the prose replacement and parameter-name replacement.
2. Update the diff tab spec to state when character-level marks are shown.

## Tests

- The long algorithm description replaced by a short unrelated sentence has no changed spans.
- `@param {number} farm` replaced by `@param {number} test` marks `farm` and `test`.
- Run the diff-scoped check after each implementation step.

## Out of scope

- Changing line pairing, line backgrounds, syntax colors, or the LCS algorithm.
