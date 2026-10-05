# Render an application command's markdown reply in an xterm decoration

**Complexity: 5/10** — A command run from the shell tab's command bar that answers with text (`help`, `state`, …) has its markdown reply converted to ANSI escapes and written into the terminal. ANSI can bold, color and indent, but it cannot render what the agent tab's transcript renders — proportional tables that wrap, real headings, links as links — so `help`'s tables in particular arrive as fixed-width approximations. xterm 6 offers decorations: a DOM element anchored to a buffer line that scrolls with it. The reply can be rendered as HTML in one.

## Goal

A markdown reply shown in a shell tab is rendered as HTML — the same sanitized markdown rendering the transcript uses, in the terminal's theme colors — in a block that sits in the terminal's scrollback directly under the echoed command line, scrolls with the terminal, and leaves zsh's next prompt below it. When the block cannot be placed, the reply falls back to the current ANSI rendering, unchanged.

## Approach

A new `insertMarkdownBlock(terminal, line, markdown)` in the shell plugin:

1. Renders the reply with the host's exported `renderMarkdown` (marked + DOMPurify).
2. Measures it: a hidden probe with the block's classes, the terminal screen's width, and the HTML is appended to the xterm screen element, its height read, and removed. The row height is the screen's height divided by its rows.
3. Writes the echoed command line and as many blank lines as the block needs, then — in the write's completion callback, once the cursor has moved — registers a marker on the first reserved line and a `top`-layer decoration over the reserved rows, whose element is filled with the HTML once, and writes the `> ` prompt after it.
4. Answers false, writing nothing, when there is no rendered HTML, no screen element, the alternate buffer is active, or the measurement is zero; the caller then uses the existing ANSI path.

The terminal hook gains `displayReply(line, markdown)`, which tries the block and otherwise writes `formatDispatchedCommand(line, markdownToAnsi(markdown))` as today. `useShellSubmit` calls it for a dispatched reply instead of formatting the ANSI itself.

The block reuses the transcript's `.line.markdown` styles, so tables, code and headings look as they do in an agent tab, with the shell theme's background, and scrolls internally if a later resize makes its content taller than the rows reserved for it. It is not part of the terminal's text buffer, so terminal text selection and scrollback search do not see its contents.

## Implementation

1. `web/src/plugins/shell/markdown-block.ts`: `insertMarkdownBlock` as above.
2. `useShellTerminal`: add `displayReply` to the handle.
3. `useShellSubmit`: take `displayReply` instead of `display`, and drop its own ANSI formatting.
4. `ShellTab`: pass `displayReply`.
5. `shell.css`: the `.shell-output-block` rule.
6. Update the shell-tab spec's paragraph on command replies.

## Tests

- `markdown-block.test.ts` with a fake terminal: a measured reply writes the echo and reserved rows, registers a marker at minus the row count and a decoration of that height over the full width, fills the rendered element once with the HTML, and writes the prompt; it answers false and writes nothing when the screen measures zero, when the alternate buffer is active, or when there is no screen element.
- `useShellTerminal.test.ts`: `displayReply` falls back to the ANSI reply when the block cannot be placed (jsdom measures zero).
- Existing `ShellTab.test.tsx` reply tests keep passing through the fallback.

## Out of scope

- Rich content other than markdown (images, interactive widgets) and structured output from the server.
- Making the block's text part of the terminal buffer for selection or search.
