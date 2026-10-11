# Preserve roles after failed writes

Complexity: 4/10 (threshold: 7).

## Goal

Keep the last valid roles configuration and visible tab payload intact when saving an edit fails.

## Approach

Publish a narrow configuration writer in `src/plugins/files.ts` that delegates to the existing atomic writer. The roles writer keeps its directory creation and boolean result while replacement preserves existing permissions. Exercise actual partial temporary writes and failed replacements through filesystem spies.

## Implementation steps

1. Add the shared writer and use it in `src/plugins/roles/roles-file.ts`. Run `./scripts/run.mjs check-diff`.
2. Extend roles file and activation tests for partial writes, failed replacement, temporary cleanup, permissions, rejection, unchanged payload, and readable original roles. Run `./scripts/run.mjs check-diff`.
3. Update `product/specs/roles.md` and the existing persistence description in `documentation/user-documentation/tab-types/roles.md`, promote this plan, and remove only the resolved backlog entry. Run `./scripts/run.mjs check-diff`, then commit and push to the existing open PR.

## Tests

Verify a failure after writing partial temporary output preserves the original destination bytes and removes the temporary file. Verify failed replacement does the same. Verify successful writes retain destination permissions. Verify an activation edit with failed replacement rejects with the existing message, publishes nothing, and leaves the original roles readable. Retain precedence, damage refusal, round trips, and launcher tests.

## Out of scope

Role name serialization, stale entry edits, filesystem durability guarantees, new plugin capabilities, PR description changes, and unrelated documentation.
