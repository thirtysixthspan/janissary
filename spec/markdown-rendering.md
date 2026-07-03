# Markdown Rendering

ACP agent replies are written in Markdown and rendered as formatted Markdown in the tab transcript
(headings, lists, tables, fenced code, blockquotes, links). Every other transcript line — shell
output, command echoes, inter-agent messages — stays plain text; only entries explicitly flagged as
Markdown are interpreted. The request lives in `src/controller.ts` (`runAcp`), the buffer model in
`src/types.ts` / `src/tab.ts`, and the rendering in `web/src/Transcript.tsx`.

### Requesting Markdown

The ACP prompt primer (prepended to the user's prompt — see the ACP section) instructs the agent to
*"Write your replies in GitHub-flavored Markdown (headings, lists, tables, fenced code blocks,
etc.); the tab renders them as formatted Markdown."* So the agent's prose arrives as Markdown rather
than the single unbroken line it would otherwise return.

### The `markdown` flag

A transcript entry (`LogEntry`) carries an optional `markdown` boolean. The ACP reply entry sets it
(`startTurn` in `runAcp`); the streamed text is stored **verbatim** — no terminal-style table
box-drawing or word-wrapping is applied (those would destroy Markdown structure). The flag is the
only thing that distinguishes a Markdown entry from ordinary output.

### Flattening (one block, not lines)

The transcript is normally a flat `BufferLine[]` where each entry's output is split on newlines into
one `output` line apiece (`flattenBuffer`, `src/tab.ts`). A `markdown` entry is the exception: its
output is emitted as a **single** `markdown` buffer line carrying the whole raw Markdown string, so
multi-line constructs (lists, tables, code fences) reach the client intact. The user's prompt line
still renders above it as usual.

### Client rendering

The web client renders a `markdown` buffer line by:

1. **Parsing** the Markdown to HTML with `marked` (GFM enabled — tables, fenced code, task lists;
   single newlines become line breaks).
2. **Sanitizing** the HTML with `DOMPurify` before insertion. Agent output is untrusted, so any
   `<script>`, event-handler attributes, or other active markup the model might emit are stripped;
   the result is inserted via `dangerouslySetInnerHTML`. On a parse failure the line falls back to
   plain text.

Rendered Markdown is styled to the transcript's dark theme (`web/src/theme.css`, `.line.markdown`):
headings, inline/`pre` code blocks, bordered tables, lists, blockquotes, horizontal rules, and
accent-colored links, with the per-line `pre-wrap` overridden so block elements flow normally.

### Streaming

The reply streams into its running entry as the agent produces it; the client re-parses and
re-renders the (possibly partial) Markdown on each update, so formatting appears progressively.
`marked` tolerates incomplete Markdown, so a half-finished table or code fence renders without error
and resolves once the turn completes. While the turn is in flight the tab's busy dot blinks (see
Tabs → Busy indicator).

### Scope

ACP replies and the `help` command output are flagged `markdown`; shell output, `db`/`browser` 
command results, and messages are plain text and are never passed through the Markdown pipeline. 
Auto-run agent **tool steps** (the collapsed `acp` entries) are command/result pairs, also rendered 
as plain text — only the agent's prose turns and `help` are Markdown.

### File:line links

Patterns that look like `filepath:line` or `filepath:line:col` (e.g. `src/foo.ts:42`, `tests/test.py:10:5`) in any transcript output — plain text or Markdown — are detected and rendered as clickable links. The detection requires a path separator (`/` or `\`) in the text before the colon, so bare `word:42` patterns are not matched. Clicking a file:line link opens the file in an editor tab, same as typing `open <filepath>` (the `:line` portion is stripped — the editor currently opens at the top of the file). Turns compiler errors, linter output, grep results, and other tool output into directly navigable source links with no extra commands.
