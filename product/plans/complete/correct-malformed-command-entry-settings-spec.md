# Correct malformed command-entry settings spec

**Complexity: 2/10** — documentation-only correction checked against the settings reader and editor.

## Goal

Describe malformed individual command settings accurately without weakening the unusable-file protection for malformed top-level files.

## Approach

Align the malformed-entry paragraph in `product/specs/application-commands.md` with the implemented behavior and the completed native command settings plan. Preserve the existing fallback and refusal wording for files that cannot be used as a settings object.

## Implementation steps

1. Confirm entry decoding, fallback selection, and edit behavior in `src/native-commands/settings-file.ts` and `src/native-commands/manager.ts` against `product/plans/complete/native-commands-02-settings.md`.
2. Correct the malformed-entry and unusable-file wording in `product/specs/application-commands.md`.

## Tests

- Verify the spec states malformed individual entries default both settings to true and do not prevent edits.
- Verify a successful save can clean malformed entries, while malformed JSON or a non-object top-level value still falls back and an unusable effective file still refuses edits with the existing message.
- Run the repository's diff-scoped lint, typecheck, and tests.

## Out of scope

No implementation, test, user documentation, or unrelated spec changes. Do not alter the existing fallback and error-message behavior.
