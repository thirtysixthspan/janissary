# Tie the file ls alias to the file list settings row

**Complexity: 2/10** — one production file, two added lines, five requirements and nine test scenarios (p=4.23)

## Problem

`file ls` is documented as an alias of `file list` with no settings row of its own, so disabling `file list` should refuse both typed spellings and completion should hide `ls` with the file list row. The ACP route already does this: `nativeCommandName` in `src/acp/native-commands.ts` rewrites `file ls` to `file list` before the grant and settings gate. The typed route does not: `buildApplicationCommands` in `src/application-commands.ts` constructs the native `file list` row with no aliases, so `resolveApplicationCommand('file ls ...')` matches the parent `file` builtin instead. `disabledApplicationCommand` and `completionPolicy` then consult the parent's setting, leaving a supposedly disabled command reachable from the command bar.

## Goal

Make typed dispatch and completion consult the `file list` Enabled setting for both spellings, using the same single settings row the ACP route uses. No new settings row, grant, or native command is introduced.

## Approach

Give the native `file list` row the alias spelling `file ls`. An alias must be a full word-boundary spelling to be matched: `resolveApplicationCommand` ranks rows through `matchesCommandRow`/`atFormBoundary`, which compare against `[name, ...aliases, ...forms]`, so a bare `ls` would not match the two-word input `file ls` and resolution would still fall through to the parent `file` builtin. With the full alias, `resolveApplicationCommand('file ls ...')` resolves to the `file list` row; `disabledApplicationCommand` then checks that row's `effectiveEnabled`, and `commandNameCandidates`/`completionPolicy` offer or hide the spelling with the same row. The ACP side keeps its own `nativeCommandName` rewrite, so the two routes stay consistent without sharing code.

## Implementation steps

1. `src/application-commands.ts` — in the `NATIVE_ACP_COMMANDS` loop of `buildApplicationCommands`, set the row's `aliases` to `['file ls']` when `name === 'file list'` and `[]` otherwise, leaving `name`, `forms`, `parent`, and `nativeTool` unchanged. The existing normalization pass already normalizes aliases, so no other production change is needed.

2. Verify no production file other than `src/application-commands.ts` needs editing: `src/native-commands/policy.ts` and `src/completion/command-policy.ts` already key off the resolved row's name.

## Tests

- `src/application-commands.test.ts` — update the new-subcommand row assertion so the `file list` row expects `aliases: ['file ls']` while the other four rows stay `[]`; assert `resolveApplicationCommand('file ls')` and `resolveApplicationCommand('file ls notes.md')` resolve to `file list`, and keep the assertion that no row is named `file ls`.
- `src/native-commands/policy.test.ts` — add cases proving a disabled `file list` row refuses both `file list` and `file ls` while bare `file` stays allowed, and that disabling the parent `file` row refuses both spellings.
- `src/completion/file-read.test.ts` — add cases proving disabling `file list` removes `list` and `ls` from `file ` completion while keeping `read`, enabling it offers both again, and disabling the parent `file` row hides both spellings.

## Out of scope

- No new settings row, grant, or entry in `NATIVE_ACP_COMMANDS`.
- No change to `src/acp/native-commands.ts`; its `nativeCommandName` rewrite stays the ACP-side alias.
- No PR description change; the recorded entry names none.
- Specs and help already state that `file ls` shares the `file list` setting and is offered or hidden with that row, so they need no edit.
