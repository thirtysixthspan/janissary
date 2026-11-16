# File patch 9: `file patch <JSON>` argument parser and follow-up description

**Complexity: 5/10** — 12 requirements and 24 test scenarios from the strict-shape, size-boundary, and description rules drive it, with ~75 added lines in one new file and no existing files edited (p=5.56)

Run order: 9 of 15 in the `file patch` series. Source plan: `./product/plans/complete/file-patch.md`. Depends on `./product/plans/ready/file-patch-1-patch-section-parser.md` and `./product/plans/ready/file-patch-2-hunk-parser.md` (`parsePatchText` and the `PatchSection` shapes in `src/file-patch/parse.ts`, for the section paths in the follow-up description). Both must land first: `src/file-patch/` doesn't exist in the repo yet, and subplan 1 creates it. This subplan imports nothing from subplans 3 to 8, and depends on no later subplan.

This subplan adds the pure command-line half of `file patch`: recognizing a patch line, pulling the patch text out of its JSON argument, refusing a bad or oversized argument, and describing a patch line for the ACP follow-up prompt without its content. No caller uses it yet. Subplans 13 and 14 route typed and tool commands through it, and subplan 15 adds the primer to the same module.

## Goal

A new `src/file-patch/command.ts` exports `isFilePatchCommandLine`, `FILE_PATCH_USAGE`, `parseFilePatchCommand`, and `describePatchCommand`.

## Design decisions

From the source plan:

- **Line predicate.** `isFilePatchCommandLine(line)` matches `/^file\s+patch(\s|$)/i`, like `isFileWriteCommandLine` and `isFileEditCommandLine` in `src/file-write/command.ts`.
- **Usage.** `FILE_PATCH_USAGE` is `Usage: file patch <JSON>`.
- **Input form.** `file patch <JSON>`, where the JSON is one object `{"patchText":"<text>"}` kept on one line with newlines written as `\n`. It follows the same grammar, extraction, and escaping rules as `file write` and `file edit`. There's no raw multi-line form.
- **Strict object.** The object takes exactly one key, `patchText`, and its value must be a string. Any other key, a missing key, a non-string value, a non-object (array, string, number, `null`), bad JSON, or an empty argument prints `FILE_PATCH_USAGE` and changes nothing.
- **Size.** The JSON argument is capped at 5 MB (`FILE_POLICY_MAX_BYTES` in `src/file-read/policy.ts`, `5 * 1024 * 1024`), counted in UTF-8 bytes, and an oversized one prints `Patch too large (>5 MB). No files were changed.`. The check runs before the patch text is parsed.
- **Follow-up description.** `describePatchCommand(input)` gives the form the ACP follow-up prompt shows: `file patch <path>, <path>, …`, listing each section's path in patch order, with a Move as `<old> -> <new>`, and no content. When the JSON or the patch text is malformed, it's bare `file patch`. History, transcripts, and recordings keep the full command, as for write and edit, so this function is used only for the follow-up prompt.

Decided here:

- **Extraction.** Do it like `extractArgument` in `src/file-write/command.ts` ("`function extractArgument(`"): trim the input, match `/^file\s+patch(?:\s|$)/i` against it, and take the rest of the trimmed line after the match, with leading whitespace removed, as the argument. An argument that is empty after that is a usage error. An input that doesn't match at all (not a patch line) also returns `FILE_PATCH_USAGE` from `parseFilePatchCommand`; callers only reach it after `isFilePatchCommandLine`, so this is a guard.
- **Order of checks.** Extract the argument, validate the JSON shape (usage line on failure), then check the argument's byte size (size line on failure). That's the order `parseFileMutation` uses for write and edit (`src/file-write/command.ts`, "`export function parseFileMutation(`"): a malformed oversized argument gets the usage line.
- **Shape check.** Parse with `JSON.parse` inside a `try`, accept the value only when `isRecord` (`src/value-guards.ts`) holds, then require that `Object.keys` of it is exactly `['patchText']` and that the value is a string. Counting own keys this way also rejects a `"__proto__"` key next to `patchText`, since `JSON.parse` makes it an own key.
- **Size boundary.** The size line fires only when `Buffer.byteLength(argument, 'utf8')` is strictly greater than `FILE_POLICY_MAX_BYTES`, so an argument of exactly 5 MiB passes, as in `parseFileMutation`. The byte count is of the extracted argument (the JSON text as typed, escapes included), not of the decoded `patchText`.
- **Size line location.** The size line is a module-private constant in `src/file-patch/command.ts`, written out in full. It isn't built from the `No files were changed.` ending in `src/file-patch/messages.ts` (subplan 8), because that ending is a module constant there, not an export, and this subplan edits no existing file.
- **Result shape.** `parseFilePatchCommand(input)` returns `{ patchText: string }` or `{ error: string }`, where `error` is the full line to print. Callers tell them apart with `'error' in result`, as `describeLoopCommand` does with `parseFileMutation`'s result.
- **Description details.** `describePatchCommand` runs `parseFilePatchCommand` and then `parsePatchText` (`src/file-patch/parse.ts`), and returns bare `file patch` when either gives an error. Each section contributes one item, so a path named by two sections appears twice. An Add, a Delete, or an Update without `moveTo` contributes its `path`; an Update with `moveTo` contributes `<path> -> <moveTo>`. Every path is escaped with `displayPath` from `src/file-write/messages.ts` (not the patch runner's `src/file-patch/messages.ts`). Items are joined with `, ` after `file patch `. The label is always lower-case `file patch`, whatever case was typed, as `describeLoopCommand` lower-cases its subcommand. A path that itself holds `, ` or ` -> ` is not disambiguated; the description is display-only. An oversized argument is described as bare `file patch`, without parsing the patch text. An empty-string `patchText` passes `parseFilePatchCommand` (the runner reports `no file sections`) and is described as bare `file patch`, because `parsePatchText('')` is that error. An input that isn't a patch line is returned unchanged, as `describeLoopCommand` returns other commands unchanged.
- **No shared JSON helper.** `src/file-write/command.ts` keeps its private `parseJsonObject`, and this subplan doesn't export it or edit that file (subplan 14 limits its edits to one import and the widened predicate). Write the shape check above as one patch-specific function in `src/file-patch/command.ts`, not as a copy of `parseJsonObject` plus `readRequiredString`. `sonarjs/no-identical-functions` (`eslint.config.mjs`) compares functions within one file only, so it can't fire across these two files. The cross-file risk is `npm run duplication` (`jscpd` with `.jscpd.json`: 5 lines, 50 tokens); if it reports a clone against `src/file-write/command.ts`, restructure the local code rather than export.
- **Leading slash.** The predicate and parser don't strip a leading `/`, matching `src/file-write/command.ts`. They see a line starting with `file` on every path that will reach them: the typed command matched `/^file\b/i` in `src/commands/file.ts`, and an ACP command line passed the file tool's `isCommandLine` test in `src/acp/tool-table.ts`, which runs on lines `cleanCommandLine` (`src/acp/command-line.ts`) has already cleaned. Note that `runWorkspace` in `src/acp/run-prompt.ts` tests a slash-stripped copy (`normalized`) but passes the raw `command` to `mutateFileInTab`, while `src/remote/serve-acp-loop.ts` passes `normalized`. Neither difference matters here, because the parser trims its own input.
- **Module shape.** Keep each function small (extraction, shape check, parse, describe) so `sonarjs/cognitive-complexity` stays far under 15. Imports are `parsePatchText` (and the `PatchSection` type, with `import type`) from `./parse.js`, `displayPath` from `../file-write/messages.js`, `FILE_POLICY_MAX_BYTES` from `../file-read/policy.js`, and `isRecord` from `../value-guards.js`. No re-exports. `parse.ts` never imports `command.ts`, so `import-x/no-cycle` stays clean. The file stays well under 200 lines, with room for subplan 15's `FILE_PATCH_PRIMER`.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Mutation argument parsing | `extractArgument`, `parseJsonObject`, `readRequiredString`, `parseFileMutation` in `src/file-write/command.ts` | Model for extraction, strict keys, and the size check order. Not imported. |
| Follow-up description | `describeLoopCommand` in `src/file-write/command.ts` | Model for the content-free description (bare label on error, lower-case label, other commands unchanged). Subplan 15 makes it delegate here. |
| Object guard | `isRecord` in `src/value-guards.ts` | Rejects arrays, scalars, and `null`. |
| Path escaping | `displayPath` in `src/file-write/messages.ts` | Description paths. |
| Size cap | `FILE_POLICY_MAX_BYTES` in `src/file-read/policy.ts` | The 5 MB argument cap. |
| Patch parser | `parsePatchText`, `PatchSection` in `src/file-patch/parse.ts` (subplans 1 and 2) | Section kinds, paths, and `moveTo` for the description. |
| Size-test fixture | `writeArgument` in `src/file-write/command-size.test.ts` | Model for building an argument of an exact UTF-8 byte length. |

## Proposed changes

- New `src/file-patch/command.ts` with the four exports above. `FILE_PATCH_PRIMER` is added to this module in subplan 15, next to its consumer. No existing file is edited.

## Tests

New `src/file-patch/command.test.ts` (vitest `server` project), covering:

- The predicate: `file patch {…}`, `FILE PATCH {…}`, `file\tpatch {…}`, and bare `file patch` match; `file patching` and `file write {…}` don't.
- Usage errors, each asserted against the literal `Usage: file patch <JSON>`: bare `file patch`, `file patch` followed only by spaces, bad JSON, an array, a JSON string, a number, `null`, a missing `patchText`, a non-string `patchText`, an extra key beside `patchText`, and a non-patch input such as `file write {…}`.
- A valid object returns its text with `\n` decoded, and surrounding whitespace around the whole line or the argument is tolerated.
- Size: an argument of exactly `FILE_POLICY_MAX_BYTES` bytes passes; one byte over prints `Patch too large (>5 MB). No files were changed.` (asserted literally); multi-byte characters are counted by UTF-8 bytes, not string length; and a malformed oversized argument gets the usage line. Build the arguments like `writeArgument` in `src/file-write/command-size.test.ts`.
- `describePatchCommand`: a four-section patch (Add `a.md`, Update `src/a.ts` with a hunk, Update `src/x.ts` with `*** Move to: src/y.ts`, Delete `old.txt`) gives `file patch a.md, src/a.ts, src/x.ts -> src/y.ts, old.txt`. Two sections naming one path list it twice. `FILE PATCH {…}` is described with a lower-case label. Bad JSON, a malformed patch text, an empty `patchText`, and an oversized argument each give bare `file patch`. A path and a Move target holding a newline are escaped, so the description has no `\n`. A non-patch input such as `file read notes.md` comes back unchanged.

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- No manual check: no command routes here until subplan 14.

## Out of scope

- `FILE_PATCH_PRIMER` and the `describeLoopCommand` delegation (subplan 15).
- Widening `isFileMutationCommandLine` (subplan 14) and the runner branch that calls `parseFilePatchCommand` (subplan 13).
- A raw multi-line patch form in ACP replies or the command bar (source plan, Out of scope).
- Command-bar completion of `patch` (source plan, from precedent).
