# Interpret ANSI escape codes in shell command output

**Complexity: 5/10** — no new architecture and no new dependency (a small hand-rolled SGR
parser), but it touches the transcript's three output-rendering branches and composes with the
existing file-link and search-highlight logic; about four files touched.

## Goal

When a shell command (run directly or by an agent — e.g. a test suite invocation like
`npm test`) produces output containing ANSI escape codes (color, bold, underline), the
transcript renders that styling instead of showing raw/invisible escape bytes or garbled text.

## Background

- `src/shell.ts` `executeShellCmd`/`spawnShell` spawn a plain piped (non-PTY) child process and
  concatenate `stdout`/`stderr` chunks verbatim into a string — any ANSI escape sequences a
  tool emits (many CLIs force color via `FORCE_COLOR`/CI-detection even without a real TTY,
  and Vitest is one of them, matching the issue's "test suite" example) pass through untouched.
- `src/shell-manager.ts` `ShellManager.run()`/`execute()` stores that raw string as
  `LogEntry.output` with no ANSI handling.
- `src/tab-formatting-handlers.ts` `handleInputOutput` (lines 66-73) splits `entry.output` on
  `'\n'` and pushes one `BufferLine{ type: 'output', text: expandTabs(outLine) }` per line,
  again with no ANSI handling — the escape bytes survive into the client-visible `BufferLine`
  unchanged.
- `web/src/transcript-line.tsx` renders `line.text` as literal text in three places: the
  `running` branch (line ~119), the `acp` branch (lines ~121-126), and the final plain
  `output` branch (lines ~128-132, the most common case) — none of them interpret escape
  codes, so a colored test-runner summary shows as raw/invisible bytes today.
- `TerminalCard`/`useXterm.ts` already interpret ANSI correctly via `@xterm/xterm`, but they
  are wired only to genuine PTY sessions (`BufferLine.terminal` set from `TerminalEntry`) —
  routing one-shot shell command output through a PTY instead would be a much larger
  architecture change, out of scope for this fix.
- No ANSI library (`strip-ansi`, `ansi-to-html`, `ansi_up`, `ansicolor`, `chalk`) is used
  anywhere in the codebase today — this is a from-scratch addition.
- `web/src/theme.css` is a single fixed dark palette (no light/dark media query in this app);
  new classes can use plain hex values in the same style as the existing `.line.output.running`
  (`#ffd93d`) and `.editor-saved`/`.editor-error` rules.
- `web/src/file-link.ts` `fileLineSegments`/`renderFileLinkSegments` already do a similar
  "parse text into typed segments, render segments to React nodes" pattern for `file:line`
  links — the new ANSI parser follows the same shape and composes with it (see Approach).

## Approach

Parse and render ANSI escape codes **client-side**, at the same point `line.text` is turned
into React nodes — the raw string stays unchanged everywhere else (protocol types, server
storage, `LogEntry.output`, `BufferLine.text`), so no wire/protocol change is needed.

Add `web/src/ansi.ts`: a small pure parser that recognizes `ESC [ ... letter` (CSI) sequences.
For `m` (SGR) sequences it tracks running foreground/background/bold/underline state and emits
`{ text, className }` segments (className encodes the current style as CSS classes, e.g.
`ansi-fg-2 ansi-bold`); any other CSI sequence (cursor movement, clear-line, etc.) is recognized
and silently dropped from the visible text (it's terminal control noise in a static transcript
view, not information to preserve). Unrecognized/malformed escape bytes outside a full CSI match
are left as-is (rare in practice, and stripping only well-formed sequences avoids accidentally
eating adjacent real text).

In `transcript-line.tsx`, only when `hasAnsiCodes(line.text)` is true, render via the new
segments instead of the current plain-text path — behavior for text without escape codes is
byte-for-byte unchanged. Priority order matches existing precedent (search hit still wins, same
as today): **search hit → ANSI segments → existing per-branch fallback.** The final `output`
branch additionally re-runs the existing `fileLineSegments`/`renderFileLinkSegments` **within**
each ANSI segment's plain text, so a colored stack trace still gets clickable `file:line` links
(the two parsers compose cleanly because ANSI segments are already escape-code-free chunks of
text — no offset-mapping between raw and stripped positions is needed). The `running` and `acp`
branches don't currently do file-link detection either, so their ANSI rendering doesn't add it.

## Implementation steps

1. **`web/src/ansi.ts`** (new file) — export:
   - `type AnsiSegment = { text: string; className?: string }`
   - `hasAnsiCodes(text: string): boolean` — quick `\[` test used as the gate before doing
     any parsing work.
   - `parseAnsi(text: string): AnsiSegment[]` — walks CSI sequences (`/\[[0-9;]*[A-Za-z]/g`),
     tracking SGR state (reset `0`; bold `1`/`22`; underline `4`/`24`; standard fg `30-37`/`39`;
     standard bg `40-47`/`49`; bright fg `90-97`; bright bg `100-107`; unrecognized codes, e.g.
     256-color/truecolor, are ignored rather than erroring) and building a `className` string per
     run of text (`ansi-fg-<0-15>`, `ansi-bg-<0-15>`, `ansi-bold`, `ansi-underline`, space-joined,
     `undefined` when no style is active).
2. **`web/src/transcript-line.tsx`**:
   - Import `hasAnsiCodes`, `parseAnsi` from `./ansi`.
   - Add a small local helper that renders `AnsiSegment[]` to `React.ReactNode[]`, taking an
     optional `client` — when given, each segment's text is passed through
     `renderFileLinkSegments(fileLineSegments(seg.text), client)` instead of rendered as a raw
     string, and a styled segment becomes `<span className={seg.className}>{content}</span>`.
   - Add a small helper `renderOutputText(text, highlight, index)` used by the `running` and
     `acp` branches: if the line is the current search hit, keep calling `highlightText` exactly
     as today; otherwise, if `hasAnsiCodes(text)`, render ANSI segments (no client → no file-link
     nesting, matching those branches' current behavior); otherwise fall back to `highlightText`
     unchanged (a no-op pass-through when there's no active highlight, same as today).
   - In the final plain `output` branch, keep the existing `hit ? highlightText(...) : ...`
     structure, but change the `...` fallback to: `hasAnsiCodes(line.text) ? <ansi+file-link
     render> : renderFileLinkSegments(fileLineSegments(line.text), client)` (unchanged for the
     no-ANSI case).
3. **`web/src/theme.css`** — add rules alongside the existing `.line.output` rules: 8 standard +
   8 bright foreground classes and background classes using a conventional 16-color ANSI
   palette (matching common terminal defaults), plus `.ansi-bold { font-weight: 700; }` and
   `.ansi-underline { text-decoration: underline; }`. Map ANSI "black" (`ansi-fg-0`) to
   `var(--faint)` rather than pure black, since literal black-on-dark-background would be
   unreadable against this app's fixed dark theme.

## Tests

- `web/src/ansi.test.ts` (new) — `hasAnsiCodes` true/false cases; `parseAnsi`: plain text with
  no codes returns a single unstyled segment; a single SGR color code produces a styled segment
  with the right className; multiple SGR codes combine into one className (e.g. bold + red);
  `0`/no-params reset clears active style; unsupported SGR codes (e.g. 256-color `38;5;208`) are
  ignored without throwing; a non-`m` CSI sequence (e.g. cursor-move `[2A`) is dropped from
  the output text entirely; text with no trailing reset still ends cleanly at end-of-string.
- `web/src/transcript-line.test.tsx` — add a `describe('renderLine — ansi output')` block:
  a plain `output` line with an SGR-colored substring renders a styled `<span>` with the
  expected class and preserves the surrounding plain text; a colored line containing a
  `file:line` pattern still renders a clickable file-link inside the styled span; a `running`
  line and an `acp` line with ANSI codes each render styled spans (no file-link) for those
  branches; a line with an active search hit and ANSI codes still shows the `search-hit` span
  (search hit continues to take priority, unchanged from today); a plain non-ANSI line is
  byte-for-byte unaffected (existing tests already assert this and must keep passing unmodified).

## Out of scope

- OSC-style escape sequences (terminal title-setting, OSC-8 hyperlinks) — only CSI sequences
  (the overwhelming majority of color/formatting output from CLI tools, including test runners)
  are interpreted; any OSC bytes are left as literal text, same as today.
- 256-color (`38;5;n`) and truecolor (`38;2;r;g;b`) SGR codes — only the 16 standard/bright
  ANSI colors are supported; unsupported codes are silently ignored (no crash, no style change).
- Making `src/tab-formatting-handlers.ts` `expandTabs` ANSI-aware. It already only runs when a
  line contains a literal tab, and does not account for embedded escape bytes when computing
  tab-stop columns — a line that mixes tabs and ANSI codes could get its tab stops
  miscalculated. This is a pre-existing limitation of `expandTabs` unrelated to ANSI
  interpretation itself; fixing it is a separate, orthogonal change.
- Routing shell command output through a real PTY (which would get xterm.js's ANSI handling for
  free) — a much larger architectural change than warranted here.
- Any change to `src/shell.ts`, `src/shell-manager.ts`, `src/tab-formatting-handlers.ts`, or the
  `LogEntry`/`BufferLine` protocol types — the raw string is preserved end-to-end; only client
  rendering changes.

## Verification

`./scripts/run.mjs check-diff` must pass clean. Manual: run a shell command that emits ANSI
color codes even without a real TTY (e.g. `FORCE_COLOR=1 npm test` in a shell tab, or any tool
that force-colors output) and confirm the transcript shows colored/bold text instead of raw
escape bytes, and that any `file:line` patterns within the colored output remain clickable.
