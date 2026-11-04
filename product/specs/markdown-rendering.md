# Markdown Rendering

ACP agent replies are written in Markdown and rendered as formatted Markdown in settled shell replies and connection-tab answers (headings, lists, tables, fenced code, blockquotes, links). Shell ACP output has no separate streaming response panel. Ordinary shell output and command echoes stay plain text; only transcript entries explicitly flagged as Markdown are interpreted. Completed shell background replies, including monitor replies, use the shell's Markdown reply renderer. Core transcript tagging and immutable entry identity remain intact. See [[acp]] and [[shell-tab]].

ACP transcript snapshots instead open as plain-text `.txt` captures in an editor tab. Markdown markup and link targets remain literal text, not formatted Markdown or clickable links. These captures are separate from the retained shared transcript renderer described below.

### Requesting Markdown

The ACP prompt primer (prepended to the user's prompt — see the ACP section) instructs the agent to
*"Write your replies in GitHub-flavored Markdown (headings, lists, tables, fenced code blocks,
etc.); the tab renders them as formatted Markdown."* So the agent's prose arrives as Markdown rather
than the single unbroken line it would otherwise return.

### The `markdown` flag

A transcript entry (`LogEntry`) carries an optional `markdown` boolean. The ACP reply entry sets it
(`startTurn` in the ACP manager); the streamed text is stored **verbatim** — no terminal-style table
box-drawing or word-wrapping is applied (those would destroy Markdown structure). The flag is the
only thing that distinguishes a Markdown entry from ordinary output.

### Flattening (one block, not lines)

The transcript is normally a flat `BufferLine[]` where each entry's output is split on newlines into
one `output` line apiece (`flattenBuffer`, `src/tab/formatting.ts`). A `markdown` entry is the exception: its
output is emitted as a **single** `markdown` buffer line carrying the whole raw Markdown string, so
multi-line constructs (lists, tables, code fences) reach the client intact. The user's prompt line
still renders above it as usual.

### Client rendering

The web client's shared transcript renderer renders a `markdown` buffer line by:

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

The reply streams verbatim into its running transcript entry as the agent produces it. Live activity is visible in the connection tab, while the shell renders its one Markdown answer only on settlement. Transcript snapshots preserve the text present when opened. The shared renderer tolerates incomplete Markdown without executing active markup. While the turn is in flight the tab's busy dot blinks (see Tabs → Busy indicator).

### Scope

ACP replies and the `help` command output are flagged `markdown`; shell output, `db`/`browser` 
command results, and messages are plain text and are never passed through the Markdown pipeline. 
Auto-run agent **tool steps** (`acp` entries) are command/result pairs, also rendered
as plain text — only the agent's prose turns and `help` are Markdown.

### File:line links

Patterns that look like `filepath:line` or `filepath:line:col` (e.g. `src/foo.ts:42`, `tests/test.py:10:5`) in output shown by the shared transcript renderer, whether plain text or Markdown, are detected and rendered as clickable links. The detection requires a path separator (`/` or `\`) in the text before the colon, so bare `word:42` patterns are not matched. Clicking a file:line link opens the file in an editor tab, same as typing `edit <filepath>:<line>`, with the cursor placed on the target line and scrolled to the middle of the tab (see Editor Tab → Scrolling). Turns compiler errors, linter output, grep results, and other tool output into directly navigable source links with no extra commands.
