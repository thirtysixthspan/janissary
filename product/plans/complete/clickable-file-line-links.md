# Clickable file:line links in transcript output

**Complexity: 6/10** — client-side text parsing and rendering in React, regex-based pattern detection, integration with the existing markdown renderer, and click handling across both plain output and markdown block types.

## Goal

Detect `filepath:line` patterns (e.g. `src/foo.ts:42`, `tests/test.py:10:5`) in transcript output, render them as clickable links, and open the referenced file in an editor tab when clicked. Turns compiler errors, linter output, grep results, and other tool output into directly navigable source links — no extra `open` commands needed.

Column numbers (`file:line:col`) in the source text are preserved for display but only the file path is used for opening; the editor currently opens at the top of the file. Line-aware editor opens are out of scope for this fix.

## Design decisions

**Client-side detection only.** No server-side changes. The regex runs on the client when rendering each output line. This keeps the protocol unchanged and the server's `flattenBuffer` pipeline untouched.

**Regex is scoped to paths containing a directory separator.** Bare `word:42` patterns are not file paths — they're too ambiguous (time notations, ratios, etc.). The regex requires at least one `/` or `\` in the text before the `:digits` suffix.

**Output lines use React segments; markdown lines pre-process text.** For plain `output` type lines, the renderer splits text into segments (plain text + clickable link spans) and renders as React children. For `markdown` type lines, the text is pre-processed to convert file:line patterns into markdown links `[match](match)` before `renderMarkdown()`, and the existing link-click handler is extended to also intercept non-http hrefs that match the file:line regex.

**Click sends an `open <filepath>` command** (stripping the `:line` suffix). The file is resolved relative to the active tab's cwd by the existing `open` command handler, same as typing `open src/foo.ts`.

## Implementation steps

### 1. Create `web/src/file-link.ts`

Regex: `/\b([\w.\-/\\]+[\/\\][\w.\-/\\]+):(\d+)(?::(\d+))?\b/g`

Exports:
- `FILE_LINE_REGEX` — the regex for matching
- `fileLineSegments(text)` — splits text into `({ type: 'text', content } | { type: 'link', fullMatch: string, path: string, line: number })[]`
- `linkifyMarkdown(text)` — converts file:line patterns to `[match](match)` markdown links for pre-processing

The regex matches: word chars, dots, dashes, slashes (at least one path separator) followed by `:digits` with optional `:digits` column suffix. Word boundary at start and end prevents matching mid-word fragments.

### 2. Modify `web/src/transcript-line.tsx`

- Import `FileLink` component from `file-link.ts`
- For `output` type lines (non-running, non-acp): render using `FileLink` component which maps segments to plain `<span>` or clickable `<span className="file-link">` with `onClick` → `client.send({ method: 'command', params: { text: 'open ' + segment.path } })`
- For `markdown` type lines: call `linkifyMarkdown(text)` before passing to `Markdown` component. Extend the `Markdown` component's `onClick` handler to also intercept `<a>` elements whose `href` matches the file:line regex — when matched, strip the `:line` suffix and send `open <filepath>`.

### 3. Add CSS

In `web/src/theme.css`, style `.file-link` to look clickable: underline on hover, cursor pointer, no color change (matches surrounding text).

### 4. Tests

- `web/src/file-link.test.ts` — test `fileLineSegments`: single match, multiple matches, no match, match at start/middle/end of text, column suffix, edge cases (URLs not matched, bare `word:42` not matched, `:line` in non-path context not matched)
- `web/src/transcript-line.test.tsx` — extend existing markdown link tests: clicking a file:line markdown link sends `open <filepath>`; add an output-type test with file:line link click

## Out of scope / explicitly unchanged

- No editor cursor positioning at the line number (opens at line 0, same as `open <file>` today)
- No server-side changes — protocol, flattenBuffer, and tab-formatting are untouched
- No regex changes in markdown or markdown-sanitize
- No fuzzy matching or partial-name matching
- Column numbers (`:col`) are parsed but discarded for opening

## Verification

`./scripts/run.mjs check-diff` after each step. No manual verification needed beyond CI passing.
