# Render application-command replies as markdown in the shell terminal

**Complexity: 5/10** — A shell tab shows an application command's text reply by writing it straight into xterm, so markdown arrives as raw markup: `##` before headings, `**` around bold text, and pipe-delimited tables. The agent tab's transcript renders the same reply as HTML, which a terminal cannot show. The fix renders the markdown to ANSI-styled text in a pure module on the client before it is written.

## Goal

An application command's reply in a shell tab reads as rendered markdown: headings and emphasis styled, code colored, lists marked, quotes barred, links showing their targets, and tables lined up in columns.

## Approach

Lex the reply with `marked`, the parser the transcript already uses, with the same `gfm` and `breaks` options, and walk its tokens to produce text styled with SGR escapes. Each style is turned off with its own reset code so nested styles survive. Table columns are padded by visible width, ignoring escapes. The shell tab's submit path renders the reply before formatting it for the terminal; plain text passes through unchanged.

## Implementation

1. Add `ansi-text.ts` with the SGR style helpers, a visible-width measure, and character-reference decoding.
2. Add `markdown-to-ansi.ts`, rendering block tokens (headings, paragraphs, code, quotes, lists, tables, rules) and inline tokens (strong, emphasis, strikethrough, code, links, images, breaks, escapes).
3. Render the reply through `markdownToAnsi` in the shell submit path before `formatDispatchedCommand`.
4. Update the shell-tab spec and the shell user documentation.

## Tests

- Plain text and line breaks pass through unchanged, and empty output renders nothing.
- Emphasis, code, strikethrough, headings, lists (nested, ordered, tasks), tables, code blocks, quotes, rules, links, and character references render as the expected escapes and layout.
- The shell tab writes a styled reply to the terminal with no raw markup left in it.

## Out of scope

- Syntax highlighting inside code blocks.
- Wrapping wide tables to the terminal width; the terminal wraps them as it wraps any long line.
