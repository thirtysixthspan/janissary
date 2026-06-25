# Tab Transcript

The scrollable output area that displays command inputs and their results. The transcript is stored as structured log entries but rendered as a flat line buffer — each entry is expanded into individual lines (one prompt line + one or more output lines). Scrolling operates on individual lines, not entries.

### Line buffer assembly

Log entries are flattened into a `BufferLine[]` array. Each entry produces one prompt line (`>` + command text). If the entry is in `Running...` state, it produces one running-indicator line. Otherwise, its output text is split by newlines, producing one output line per segment.

### Collapsed agent tool steps

Auto-run agent tool steps (entries flagged `acp`, produced by the ACP tool loop) are **collapsed by default**: `flattenBuffer(log, collapseToolSteps)` replaces each contiguous run of `acp` entries with a single `▸ N tool steps  (ctrl+t to expand)` summary line (a `collapsed` `BufferLine`). Empty continuation turns interspersed in a run are absorbed without breaking it or inflating the count; a visible (non-`acp`) prose turn or message breaks one run into two. The surrounding user prompt and the agent's final answer stay visible.

`Ctrl+T` toggles the per-tab `Tab.toolStepsExpanded` flag (in-memory, like `scrollOffset`, not persisted), resetting scroll to the bottom. When expanded, each step renders as its `+ <command>` line followed by the command's response on the indented output lines beneath it (the `ranCommand` handler stores the command in the entry's `input` and the result in its `output`). Both the render path and the scroll-length calculation pass the same `!toolStepsExpanded` flag to `flattenBuffer`, so scrolling math matches what is drawn.

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
