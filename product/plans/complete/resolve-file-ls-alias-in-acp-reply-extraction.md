# Resolve the file ls alias in ACP reply extraction

**Complexity: 2/10** — ~3 added lines in 1 production file, 5 requirements, 6 scenarios (p=4.16)

## Goal

Make a role session that ends its reply with `file ls <path>` actually run the listing, the same as `file list <path>`, instead of having the command silently ignored. The alias is already advertised in the `file list` primer and is already understood by the parser, the completion, and the workspace runner; the only gap is that the ACP reply-extraction and gate path cannot resolve the alias to a native command name.

## Design decisions

- `file ls` is a parser and completion alias of `file list`, not a command of its own. It must not gain an entry in `NATIVE_ACP_COMMANDS`, a native settings row, an application-command inventory row, or a grant for roles. A role that grants `file list` is what authorizes the alias.
- The fix is confined to `nativeCommandName` in `src/acp/native-commands.ts`: before looking for a native name, rewrite a leading `file ls` spelling to `file list`. Every consumer of `nativeCommandName` then inherits the alias without changes — `toolExtractor` in `src/acp/tool-table.ts` (which requires a native name before it checks `isCommandLine`), `gateCoreCommand` (which looks up the settings row and grant by native name), `nativeCommandTool`, and `isNativeCommand`.
- The rewrite is case-insensitive and tolerant of the leading/trailing whitespace and repeated inter-word whitespace that `matchesNativeCommand` already accepts, and is bounded by a word boundary so near-misses such as `file lsignore` or `file ls-foo` keep their current behavior.
- The reply line itself is returned unchanged by `toolExtractor` and echoed unchanged in gate refusals; only the native name resolution uses the canonical `file list` spelling. Execution already runs through `isFileListCommandLine` and `parseFileList`, both of which accept `ls`.

## Implementation steps

1. In `src/acp/native-commands.ts`, add a single module-level constant holding a case-insensitive, whitespace-tolerant regex for a leading `file ls` followed by a word boundary, and rewrite that prefix to `file list` inside `nativeCommandName` before the `NATIVE_ACP_COMMANDS` lookup. Leave `matchesNativeCommand`, `nativeCommandTool`, `isNativeCommand`, `NATIVE_ACP_COMMANDS`, and the application-command inventory untouched.

## Tests

- In `src/acp/native-commands.test.ts`, assert `nativeCommandName('file ls docs')` is `file list`, with the same result for mixed case and extra whitespace, and that `nativeCommandTool('file ls docs')` is `file` and `isNativeCommand('file ls docs')` is true while near-miss spellings still resolve to nothing.
- In `src/acp/tool-table.test.ts`, assert `toolExtractor` on a reply ending in `file ls docs` returns that line on a table granting `file list`, and that `gateCommand` with a core snapshot granting `file list` returns `runsOn: 'workspace'` with no refusal.
- Keep the existing assertion in `src/application-commands.test.ts` that no `file ls` settings row exists passing unchanged.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after the source change and again after the tests, and confirm all three test files are green. Confirm `src/acp/native-commands.ts` stays well under the 200-line `max-lines` limit and that relative imports keep their `.js` extensions.

## Out of scope

No changes to the native command vocabulary, settings rows, role grants, primers, completion, parser, workspace runner, help pages, or documentation. The `file list`, `file stat`, `file exists`, `file head`, and `file tail` documentation and spec work remains the separate docs/specs subplan. Do not update the PR description.
