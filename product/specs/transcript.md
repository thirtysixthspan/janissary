# Tab Transcript

The scrollable output area that displays command inputs and their results. The transcript is stored as structured log entries but rendered as a flat line buffer — each entry is expanded into individual lines (one prompt line + one or more output lines). Scrolling operates on individual lines, not entries.

### Line buffer assembly

Log entries are flattened into a `BufferLine[]` array. Each entry produces one prompt line (`>` + command text). If the entry is in `Running...` state, it produces one running-indicator line. Otherwise, its output text is split by newlines, producing one output line per segment.

### Collapsed agent tool steps

Auto-run agent tool steps (entries flagged `acp`, produced by the ACP tool loop) are **collapsed by default**: `flattenBuffer(log, collapseToolSteps)` replaces each contiguous run of `acp` entries with a single `▸ N tool steps  (ctrl+t to expand)` summary line (a `collapsed` `BufferLine`). Empty continuation turns interspersed in a run are absorbed without breaking it or inflating the count; a visible (non-`acp`) prose turn or message breaks one run into two. The surrounding user prompt and the agent's final answer stay visible.

`Ctrl+T` toggles the per-tab `Tab.toolStepsExpanded` flag (in-memory, like `scrollOffset`, not persisted), resetting scroll to the bottom. When expanded, each step renders as its `+ <command>` line followed by the command's response on the indented output lines beneath it (the `ranCommand` handler stores the command in the entry's `input` and the result in its `output`). Both the render path and the scroll-length calculation pass the same `!toolStepsExpanded` flag to `flattenBuffer`, so scrolling math matches what is drawn.

### Hidden during interactive PTY takeover

When an interactive program (htop, vim, less, etc.) is running in full-tab PTY mode on the current agent tab, the transcript and command bar are hidden and replaced by the full-tab terminal. When the program exits, the transcript is restored to exactly the state it was in before the PTY launched — no new entries are added.

### Auto-scroll on output

New output resets scroll offset to 0 (bottom), showing the latest lines.

### Scroll up

`Ctrl+↑` (or `Shift+ArrowUp`) increments scroll offset with acceleration (see below). `Ctrl+P` increments by exactly one line (no acceleration). The plain ↑/↓ arrows are reserved for command-history navigation; the mouse scroll wheel also scrolls the transcript (one line per tick).

### Scroll down

`Ctrl+↓` (or `Shift+ArrowDown`) decrements scroll offset with acceleration (see below). `Ctrl+N` decrements by exactly one line (no acceleration).

### Accelerated scrolling

`Shift+ArrowUp`, `Shift+ArrowDown`, `Ctrl+ArrowUp`, and `Ctrl+ArrowDown` use **accelerated scrolling**: the scroll distance starts at one line (22px) and doubles every second the key is held (22px → 44px → 88px → …), capped at 10 lines (220px). The acceleration resets when you release the key or change direction (a new press in the opposite direction restarts from 22px). `Ctrl+P` and `Ctrl+N` are not accelerated — they always scroll one line per press (useful for precise positioning).

### Page scroll

PageUp and PageDown scroll by approximately half the terminal height, measured in lines.

### Scroll wheel

Terminal scroll wheel events scroll the transcript line by line (one line per tick).

### Scrollbar

When scrolled above the bottom, a scrollbar appears in the prompt bar showing a position indicator. The bar displays filled segments (`│` in `faint` color) for scrolled-past content and empty segments (`·`) for remaining content, followed by a percentage. Position is calculated as `scrollOffset / totalBufferLines`.

### Clickable file:line links

Patterns like `src/foo.ts:42` or `tests/test.py:10:5` in output and markdown lines are rendered as clickable links. Patterns are detected when the text before the colon contains a directory separator (`/` or `\`) followed by one or more digits — bare `word:42` patterns are not considered file paths.

Clicking a file:line link opens the file in an **editor tab** (same as typing `edit <filepath>:<line>`), with the cursor placed on the target line and scrolled to the middle of the tab (see Editor Tab → Scrolling).

### Re-running a prompt line

Double-clicking a previous command's prompt line re-runs that command. The double-clickable
region is limited to the `❯ <command>` text itself — a prompt line prefixed with the command's
working directory does not re-run the command when that leading directory text is double-clicked,
only the command text after it does. A single click does
nothing (letting a click-and-drag text selection happen without triggering a re-run); if the
double click lands on text that is still selected from an earlier selection, it is likewise
suppressed. A collapsed agent tool-steps summary line is a separate case: a single click (or
`Ctrl+T`) expands it instead (see "Collapsed agent tool steps" above) and does not re-run
anything.

### ANSI-colored output

Shell command output — whether run directly or by an agent — is interpreted for ANSI color and
style codes rather than shown as raw escape text. Colored, bold, and underlined text (for
example a test suite's colored pass/fail summary) renders with matching styling in the
transcript, both while the command is still running and once it has finished. A colored line
that also contains a `file:line` pattern still renders that pattern as a clickable link.
Escape sequences that aren't color/style codes (cursor movement, clear-line, and similar
terminal control sequences) are recognized and omitted from the displayed text rather than
shown as garbled characters.
