# File patch 1: pure patch-text parser for file sections

**Complexity: 6/10** — 24 requirements and 42 test scenarios from the line-classification and line-number rules drive it, with ~120 added lines and no existing files edited (p=6.33)

Run order: 1 of 15 in the `file patch` series. Source plan: `./product/plans/complete/file-patch.md`, which stays the canonical record of the whole feature. Depends on nothing.

This subplan adds the pure parser that splits a patch text into lines, strips the optional envelope, and turns the file-section markers into an ordered list of sections, or into one structural error carrying the 1-based line number and the problem. Update sections come out with their raw body lines. Subplan 2 parses those bodies into hunks. Nothing calls the parser from production code yet.

## Goal

`parsePatchText(text)` in a new `src/file-patch/parse.ts` returns either the sections in patch order or `{ error: { line, problem } }`. It does no I/O, in keeping with the "parse pure, execute effectful" rule in `ai/guidelines/architecture-principles.md` section 4.

## Design decisions

From the source plan:

- **Envelope.** `*** Begin Patch` as the first line and `*** End Patch` as the last line are both optional and are stripped when present. The text is accepted with or without them.
- **Line splitting.** The text is split on `\n`. A `\r` immediately before a `\n` is dropped, so a CRLF-typed patch parses the same as an LF one.
- **Markers.** This subplan recognizes `*** Add File: `, `*** Delete File: `, `*** Update File: `, and `*** Move to: `. Lines starting with `@@` and the `*** End of File` line are body lines of an Update section, handed to subplan 2. Every other line starting with `*** ` is `unknown marker "<line>"`.
- **Paths.** A path is taken verbatim after the marker's `: `, with surrounding whitespace trimmed. An empty path is `missing path`.
- **Add sections.** Every body line after `*** Add File: <path>` must start with `+`. The rest of the line after the `+` is one content line, kept exactly, whitespace included. Any other body line is `Add File lines must start with "+"`. An Add with no `+` lines is valid and means an empty file.
- **Delete sections.** `*** Delete File: <path>` has no body.
- **Update sections.** `*** Update File: <path>` may be followed directly by `*** Move to: <new path>`. A `*** Move to:` line anywhere else is `Move to must follow Update File`. Everything after that, up to the next file marker, is the section's body.
- **No sections.** A text with no file section at all, envelope or not, is `no file sections`.
- **Line numbers.** `line` is the 1-based line of the patch text as typed, counting the `*** Begin Patch` line when present, so the number points at the real offending line.

Decided here (the source leaves them open):

- **A trailing newline.** When the text ends in `\n`, the empty element that the split produces after it is ignored, so `"…*** End Patch\n"` still ends with the envelope. This check runs before the `*** End Patch` test.
- **Envelope lines out of place.** A `*** Begin Patch` line that is not the first line, or an `*** End Patch` line that is not the last, is `unknown marker "<line>"`.
- **Lines with no body to belong to.** A line before the first section, or after a Delete File section, that is not a file marker is `unknown marker "<line>"`, empty lines included. A blank line inside an Add body fails the Add rule. Only the single trailing newline above is forgiven.
- **Problem text.** The quoted `<line>` in `unknown marker "<line>"` is the raw line with its dropped `\r` removed. The parser doesn't escape it. Escaping for display belongs to the runner in subplan 8.
- **Update bodies.** In this subplan an Update section carries `bodyLines`: an array of `{ line, text }`, each raw body line (its `\r` already dropped) with its 1-based line number. Subplan 2 replaces that with parsed hunks and adds the Update-body problems. Until then nothing validates Update bodies.
- **Empty text.** The empty string has zero lines and is `no file sections`, so an empty `patchText` (which subplan 9 lets through) reaches the runner as that problem. A text of just `"\n"` is one blank line, which is `unknown marker ""` at line 1 under the rule above.
- **Exact envelope and marker spelling.** The envelope lines match only when the line (after the `\r` drop) is exactly `*** Begin Patch` or `*** End Patch`, case and spacing included. A file marker matches only in its exact case. A line that is exactly the marker without its trailing space (`*** Add File:`, `*** Delete File:`, `*** Update File:`, `*** Move to:`) is that marker with an empty path, so it is `missing path`, not `unknown marker`, since editors and models often strip the trailing space. A line like `*** Add File:foo` (no space after the colon) is `unknown marker`.
- **Classification order.** After the envelope is stripped, each line is classified in this order, and the first rule that matches decides it: (1) an Add, Delete, or Update File marker closes the current section and opens a new one, wherever it appears, including in the middle of an Add or Update body; (2) a `*** Move to` marker attaches to the Update section only when the line directly before it is that section's `*** Update File:` line, and otherwise is `Move to must follow Update File` whatever its path (the position check comes before the empty-path check, so a well-placed `*** Move to:` with no path is `missing path` and a misplaced one is the position problem; a second `*** Move to:` in a row fails, and one after an Update body line fails); (3) inside an Update body, `*** End of File` is a body line; (4) any other line starting with `*** ` is `unknown marker "<line>"` in every state, including inside an Add body (so `*** End of File` after an Add is `unknown marker`, not the Add rule) and inside an Update body; (5) inside an Add body, a line not starting with `+` is the Add rule's problem; (6) inside an Update body, the line is a body line; (7) before the first section or after a Delete, the line is `unknown marker "<line>"`.
- **Which line an error names.** `missing path` names its marker's line, `Move to must follow Update File` names the `*** Move to` line, `unknown marker` and the Add rule name the offending line, and `no file sections` names line 1 (for the empty text and for an envelope with nothing inside alike).
- **First error wins.** The parser walks top to bottom and returns the first problem it meets. It never collects several.
- **Lone carriage returns.** Only a `\r` immediately before a `\n` is dropped. A `\r` anywhere else, including at the very end of a text with no final `\n`, stays part of its line (so it is kept in a `+` line's content).
- **No path semantics.** The parser does not judge paths beyond emptiness: absolute paths, `..` segments, protected folders, and the same path named in several sections all parse. Their rules belong to the tree view and the section semantics (subplans 4 to 6).

## Types

`src/file-patch/parse.ts` exports these shapes:

- `PatchSection`: a union discriminated by `kind`. `'add'` carries `path` and `lines: string[]`. `'delete'` carries `path`. `'update'` carries `path`, an optional `moveTo`, and the body described above. Every section also carries `line`, the 1-based line of its marker.
- `PatchParseError`: `{ line: number; problem: string }`.
- `parsePatchText(text: string): { sections: PatchSection[] } | { error: PatchParseError }`.

Keep the problem strings as exported constants or one exported builder, so subplans 2 and 8 and the tests share one spelling.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How the parser uses it |
| --- | --- | --- |
| Pure parser precedent | `src/file-write/command.ts:113` "`export function parseFileMutation(`"; `src/file-glob/command.ts:78` "`export function parseFileGlob(`" | Same "return a value or `{ error }`, no I/O" shape. Unlike those, the error here is a `{ line, problem }` object, not a finished output line; the runner (subplan 8) formats it. |
| `diff` package | `package.json` | Not used. Its `applyPatch` needs unified-diff line numbers, which this format doesn't carry (source plan's reuse table). |

## Proposed changes

- New `src/file-patch/parse.ts`, holding the types and `parsePatchText`. Split the line walk into one small function per state (outside a section, in an Add body, in an Update body) so `sonarjs/cognitive-complexity` stays under its limit.
- Use plain `startsWith` tests for every marker, not a regular expression `security/detect-unsafe-regex` could flag.

## Tests

New `src/file-patch/parse.test.ts` (vitest `server` project), covering:

- With and without the envelope, with only one of the two envelope lines, and with an envelope line out of place.
- An Add with several `+` lines, a Delete, an Update, an Update with `*** Move to:`.
- `Move to must follow Update File` after an Add, after a Delete, after an Update body line, and as the first line.
- `unknown marker` (an unknown `***` line, a non-marker line before the first section, a line after a Delete), `missing path` for each of the four path markers, `no file sections` (empty text, and an envelope with nothing inside), and `Add File lines must start with "+"` (including a blank line in an Add). Each case asserts the exact line number, with and without a leading `*** Begin Patch`.
- An empty Add.
- Whitespace kept exactly in `+` lines (leading and trailing spaces and tabs, and a `+` with nothing after it).
- A CRLF-typed patch parsing to the same sections as its LF form, and a trailing `\n` after `*** End Patch`.
- Paths with surrounding whitespace trimmed and inner spaces kept.
- Marker spelling: `*** Add File:` with no trailing space is `missing path`, `*** Add File:foo` and a lower-case `*** add file: x` are `unknown marker`, and `*** Begin Patch ` with a trailing space is `unknown marker` at line 1.
- Classification order: a file marker in the middle of an Add body opens the next section, `*** End of File` after an Add line is `unknown marker`, an unknown `***` line inside an Update body is `unknown marker`, and two `*** Move to:` lines in a row fail on the second.
- Update `bodyLines` carrying each raw line (blank lines, `@@` lines, and `*** End of File` included) with its line number.
- Two trailing newlines after `*** End Patch` (the envelope line is then not last, so it is `unknown marker`), and a lone `\r` kept inside a `+` line.
- Each problem asserted at least once against its literal text from the source plan's Failure wording (not only against the exported constant), so a spelling drift in the constants fails a test.

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- No manual check: nothing reaches the parser from the app until subplan 14.

## Out of scope

- Hunk parsing and the Update-body problems (subplan 2).
- Applying hunks (subplan 3), the tree view and section semantics (subplans 4 to 6), commit (subplan 7), output formatting (subplan 8), and the command argument (subplan 9).
- A raw multi-line patch form in ACP replies or the command bar, and a file-mode marker (source plan, Out of scope).
