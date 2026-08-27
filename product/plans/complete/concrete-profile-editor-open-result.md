# Use concrete profile editor open results

**Complexity: 6/10** — the fix introduces a small return contract across the plain-text opener and file manager, then consumes it in profile placement. Several focused test helpers must reflect the contract, but command and plugin protocols do not change.

## Goal

A profile editor entry may be placed, focused, and reported only when its requested editor actually opened or reused a tab. A refused editor must never cause an unrelated active tab to move or appear successful.

## Approach

Have the plain-text opener report whether it opened/reused an editor, and have `OpenFileManager.edit` translate successful synchronous editor paths into a concrete tab-label result. Profile editor opening uses only that returned label for relocation and candidate creation; no result means no success note or candidate.

## Implementation steps

1. Return an explicit success signal from `openInEditor` and a concrete editor-tab label from synchronous `OpenFileManager.edit` paths.
2. Update profile editor placement to act on the returned label and omit candidates and success notes when no editor result exists.
3. Update opener, file-manager, and profile-editor tests for successful open/reuse and oversized refusal behavior.
4. Clarify profile editor launch reporting in the profiles spec, remove the backlog entry, and promote this plan after checks pass.

## Tests

- `src/open-file-manager.test.ts`: plain and synced editor opens return their concrete labels; an oversized file returns no result.
- `src/profile/editors.test.ts`: successful results create candidates and notes; no-result edits leave the unrelated active tab unmodified and unreported; relocation targets the returned tab label.
- Preserve existing file resolution, target-line, plugin dispatch, and grouping coverage.

## Out of scope

- Making plugin-owned edit presentations synchronous.
- Changing the oversized-file limit or refusal message.
- Changing profile entry schema or generic plugin profile entries.
- Changing ordinary interactive `edit` command output.
