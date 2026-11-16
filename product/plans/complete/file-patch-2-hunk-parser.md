# File patch 2: parse Update bodies into hunks

**Complexity: 6/10** — 16 requirements and 29 test scenarios from the header, empty-hunk, and lowest-line error rules drive it, with ~85 added lines and 1 file edited (p=6.15)

Run order: 2 of 15 in the `file patch` series. Source plan: `./product/plans/complete/file-patch.md`. Depends on `./product/plans/ready/file-patch-1-patch-section-parser.md`, which must land first: this subplan edits the `src/file-patch/parse.ts` and `src/file-patch/parse.test.ts` that subplan 1 creates (neither exists in the repo yet).

This subplan finishes the parser. It turns each Update section's raw body lines into hunks and adds the Update-body structural problems. After it lands, `parsePatchText` returns fully parsed sections. Nothing calls it from production code yet.

## Goal

Update sections from `parsePatchText` (`src/file-patch/parse.ts`) carry `hunks: PatchHunk[]` in place of the raw `bodyLines` subplan 1 left there, and an Update body that breaks the hunk rules fails the whole parse with its line number and problem.

## Design decisions

From the source plan:

- **Hunks.** A hunk starts at an `@@` line. A bare `@@` has no anchor. `@@ <text>` carries `<text>` as its anchor, taken exactly as written after `@@ `. The hunk's lines each start with ` ` (context), `-` (removed), or `+` (added), and the rest of the line is kept exactly. Any other line inside a hunk is `hunk lines must start with " ", "-", or "+"`.
- **End of file.** An `*** End of File` line inside a hunk marks that hunk as anchored to the end of the file and ends it.
- **No `\ No newline at end of file` marker.** Such a line inside a hunk fails with the hunk-prefix problem.
- **Empty Update.** An Update with neither a hunk nor a `*** Move to:` line is `Update File needs a hunk or Move to`, reported at the Update's marker line. An Update with `*** Move to:` and no hunks is valid.
- **Exact content.** Indentation and whitespace in hunk lines are preserved exactly. A ` ` line with nothing after the space is a context line with empty text; a `+` or `-` with nothing after it likewise carries empty text.

Decided here:

- **What the hunk parser sees.** It sees only what subplan 1's walk put in `bodyLines`: everything between the Update marker (or its `*** Move to:` line) and the next file marker or the end of the text, with the envelope already stripped. Subplan 1's walk has already turned any other `*** ` line in an Update body into `unknown marker`, so the only `***` line the hunk parser meets is exactly `*** End of File`.
- **A first hunk without `@@`.** A ` `, `-`, or `+` line as the first body line (directly after `*** Update File:` or its `*** Move to:` line) starts a hunk as if a bare `@@` came before it. Codex accepts this form and models write it. Only the first hunk may omit `@@`: after a hunk's `*** End of File`, the next body line must be an `@@` line, and a ` `, `-`, or `+` line there is the hunk-prefix problem at its line (Codex likewise allows a missing `@@` only on the first chunk).
- **Header lines and anchor text.** Any body line starting with `@@` is a hunk header. Its anchor is the text after the two `@` characters with one leading space removed when present; when that leaves the empty string, the hunk has no anchor. So `@@` and `@@ ` have no anchor, `@@ foo  ` has the anchor `foo  ` (trailing spaces kept), `@@  foo` has ` foo`, `@@@` has `@`, and `@@ -1,3 +1,3 @@` has `-1,3 +1,3 @@`, which subplan 3 then fails to find and reports. The parser doesn't try to read unified-diff numbers.
- **What a hunk needs.** A hunk needs at least one ` `, `-`, or `+` line. A hunk of only `+` lines is valid (subplan 3 treats it as a pure insertion).
- **An `@@` with no lines.** An `@@` header followed by no hunk line (the next body line is another `@@` or an `*** End of File`, or the body ends) is the hunk-prefix problem, reported at the line after the `@@`: the next body line, or, when the `@@` is the body's last line, the line that ended the body (the next file marker or the `*** End Patch` line). Only when the `@@` is the last line of the whole text is it reported at the `@@` line itself. A trailing newline's ignored empty element (subplan 1) doesn't count as a line.
- **`*** End of File` outside a hunk.** One that is the first body line (right after `*** Update File:` or `*** Move to:`) is the hunk-prefix problem at its line. One directly after a hunk's `*** End of File` (two in a row) is the same problem at the second one's line.
- **Blank lines.** A blank line inside an Update body fails the hunk-prefix rule at its line. The parser doesn't guess that it meant an empty context line.
- **The first error is the lowest line.** Subplan 1's "first error wins" means the problem at the lowest line number. The Update body is hunk-parsed when its section closes (at the next file marker, or the end of the text), so two cases need care:
  - When subplan 1's walk fails at line N inside an Update body (`unknown marker`, or a misplaced `*** Move to:`), the walk first hunk-parses that section's body lines before N, passing N as the line that ended the body. A hunk problem reported at a line before N wins; otherwise the walk's own problem at N is returned. The empty-Update check doesn't run for a body cut short this way, so `*** Update File: a` followed by `*** Foo` is `unknown marker "*** Foo"` at line 2.
  - When a file marker closes an Update section, the closed section's body is checked (hunks, then the empty-Update check) before the new marker's own `missing path` check, so a dangling `@@` reported at that marker's line wins over the marker's `missing path`.
- **Problem strings and module boundaries.** `src/file-patch/parse-hunks.ts` must not import `src/file-patch/parse.ts`, because `parse.ts` imports it and `import-x/no-cycle` is an error in `eslint.config.mjs`. So the hunk-prefix problem is an exported string constant in `parse-hunks.ts`, and the empty-Update problem sits in `parse.ts` beside subplan 1's other problem strings, in whatever form (constants or builder) subplan 1 used, since the empty-Update check runs in `parse.ts` at section close. Nothing is re-exported: the `export … from` ban in `eslint.config.mjs` (see `ai/guidelines/imports-and-barrel-files.md`) means callers import hunk types and the hunk-prefix constant from `parse-hunks.ts` directly, as subplan 3 already plans to.

## Types

Defined and exported in `src/file-patch/parse-hunks.ts` (subplan 3 imports them from there):

- `PatchHunkLine`: a `kind` of `'context'`, `'remove'`, or `'add'`, plus the line's `text` without its prefix.
- `PatchHunk`: an optional `anchor` string (absent when the header has no anchor, never the empty string), the ordered `lines`, and `endOfFile: boolean`.
- The body-line input shape `{ line: number; text: string }`. If subplan 1 named this type in `parse.ts`, move it to `parse-hunks.ts` and import it back into `parse.ts`; no `parse.ts` export keeps it otherwise.
- `parseHunks(bodyLines, endLine)`: `endLine` is the 1-based line that ended the body (the next file marker, the `*** End Patch` line, or the walk's failing line N), absent when the body runs to the end of the text. It returns `{ hunks: PatchHunk[] }` or `{ error: { line: number; problem: string } }`, an error shape declared locally that is structurally the same as `PatchParseError` in `parse.ts`, so `parse.ts` returns it unchanged.

In `src/file-patch/parse.ts`, the `'update'` member of `PatchSection` carries `hunks: PatchHunk[]` (imported as a type from `./parse-hunks.js`) and no longer carries `bodyLines`. Its `path`, optional `moveTo`, and `line` stay as subplan 1 defined them.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Section parser | `parsePatchText` in `src/file-patch/parse.ts` (subplan 1) | Its Update-body state still collects `bodyLines`; the section close and the walk's failure path inside an Update body call `parseHunks`. |
| Problem strings | Subplan 1's exported problem constants or builder in `parse.ts` | Gains `Update File needs a hunk or Move to` in the same form. The hunk-prefix problem goes in `parse-hunks.ts` (see the module-boundary decision). |
| Line numbering and `\r` dropping | Subplan 1's split in `parsePatchText` | Body lines arrive with their 1-based line numbers and dropped `\r`; the hunk parser does no line numbering or splitting of its own. |

Nothing in `src/` parses hunks today, so there's nothing else to reuse.

## Proposed changes

- New `src/file-patch/parse-hunks.ts` with `parseHunks`, `PatchHunk`, `PatchHunkLine`, the body-line type, and the hunk-prefix problem constant. Split the walk into small helpers (classify one body line, start a hunk from a header, close a hunk) so `sonarjs/cognitive-complexity` stays under 15. Use `startsWith` and exact comparisons, not regular expressions, as subplan 1 does.
- `src/file-patch/parse.ts`: import `parseHunks` and the types from `./parse-hunks.js`. Where an Update section closes, call `parseHunks` on its body, return its error, then run the empty-Update check (no hunks and no `moveTo`) at the section's marker line, and store the hunks on the section. In the walk's failure path inside an Update body, apply the lowest-line rule above. Keep it well under 200 lines; the hunk logic stays in `parse-hunks.ts`.

## Tests

New `src/file-patch/parse-hunks.test.ts` (vitest `server` project), calling `parseHunks` directly:

- Two hunks; a hunk of only `+` lines; `@@` versus `@@ <text>` anchors, with the anchor text kept exactly, trailing spaces included; `@@ ` with no anchor; `@@@` and `@@ -1,3 +1,3 @@` parsing as anchors.
- `*** End of File` setting `endOfFile` on its hunk, and followed by a further `@@` hunk.
- A first hunk with no `@@` line, and a ` ` line without `@@` after an `*** End of File` failing.
- Whitespace kept exactly in ` `, `-`, and `+` lines (leading and trailing spaces and tabs, and a prefix with nothing after it).
- The hunk-prefix problem, each with its exact line number: a bad prefix, a blank line, a `\ No newline at end of file` line, `*** End of File` as the first body line, two `*** End of File` lines in a row, an `@@` followed by another `@@`, an `@@` followed by `*** End of File`, an `@@` as the body's last line with an `endLine` (reported at `endLine`), and an `@@` as the body's last line without one (reported at the `@@`).

Updates to `src/file-patch/parse.test.ts`:

- Rewrite subplan 1's test that asserts raw Update `bodyLines` to assert `hunks` instead; its blank-line body now fails with the hunk-prefix problem, so split that case into a failure test.
- Give every subplan 1 test whose Update has no body and no `*** Move to:` (the plain "an Update" case, the classification-order cases) a hunk, or it now fails with the empty-Update problem.
- Through `parsePatchText`: an Update with `*** Move to:` and hunks, one with `*** Move to:` and none, and an `@@` before `*** End Patch` reported at the `*** End Patch` line.
- `Update File needs a hunk or Move to` at the Update's marker line, with and without a leading `*** Begin Patch`, both for a following section and for the end of the text.
- The lowest-line rule: a bad hunk line before an unknown `***` line in the same body reports the hunk line; `*** Update File: a` followed by `*** Foo` reports `unknown marker` at line 2; a dangling `@@` followed by `*** Add File:` with no path reports the hunk-prefix problem at the marker's line.
- Each new problem asserted at least once against its literal text from the source plan, not only against the constant, as subplan 1's tests do.

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- No manual check: nothing reaches the parser from the app until subplan 14.

## Out of scope

- Matching hunks against file text, anchor search, and `endOfFile` placement (subplan 3).
- Escaping quoted lines for display (subplan 8).
- A `\ No newline at end of file` marker (source plan, Out of scope).
