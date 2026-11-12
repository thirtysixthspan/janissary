# Render single-line usage replies literally

**Complexity: 2/10** — ~14 added lines in one renderer, 3 requirements, 4 test scenarios (p=4.05); the care is in keeping the predicate narrow enough that ordinary Markdown still renders.

## Root cause

A typed application command's reply is rendered as Markdown. On a shell tab, `writeShellReply` in `web/src/plugins/shell/write-shell-reply.ts` passes the reply to `insertMarkdownBlock` in `web/src/plugins/shell/markdown-block.ts`, which calls `renderMarkdown` in `web/src/shared/transcript/markdown.ts` (`marked` followed by `DOMPurify.sanitize`). A malformed `file read` answers with `FILE_READ_USAGE` from `src/file-read/command.ts`, and `ask`/`tell` answer with `` `Usage: ${role} <prompt>.` `` from `src/acp/manager.ts`. `marked` reads the bare `<path>`, `<line>`, `<lines>`, and `<prompt>` tokens as raw HTML; `DOMPurify.sanitize` then keeps or drops those elements, and the visible reply loses the placeholder text. The recorded observation is a reply block whose HTML is `<p>Usage: file read </p>`, while the server's activity log holds the full line.

The defect is in rendering, not in the messages: both the `file read` parser tests and the activity log already carry the full line, and the same truncation affects `ask`, `tell`, and other usage messages whose placeholders are not already escaped at the source. Changing only `FILE_READ_USAGE` would leave the class of defect in place.

## Correct behavior

A single-line reply that starts with `Usage: ` is command usage text, not Markdown markup. Its angle brackets must render as literal characters, so `Usage: file read <path> [--offset <line>] [--limit <lines>]` and `Usage: ask <prompt>.` are visible in full on the shell tab. Replies that are not that shape — ordinary Markdown with headings, emphasis, links, tables, or even legitimate inline HTML — must continue to render as Markdown exactly as they do today.

## Reproduction

Rendering the reply the shell tab receives through `insertMarkdownBlock`, as the existing harness usage tests do:

- A test that renders `FILE_READ_USAGE` currently produces `Usage: file read ` with all three placeholders and both flags gone.
- A test that renders `Usage: ask <prompt>.` currently produces `Usage: ask .`.

`product/specs/acp.md` already promises the full `file read` line, and `product/specs/application-commands.md` already says angle-bracket arguments in usage replies are literal text, so the implementation has fallen behind the spec.

## Approach

In `renderMarkdown`, detect text that is a single line beginning with `Usage: ` and escape its `<` and `>` before handing it to `marked`. `marked` turns `\<` back into a visible `<` in the HTML (`&lt;`), and the shell tab's ANSI fallback (`markdownToAnsi`) already prints bare placeholders because it keeps raw HTML tokens as text. Escaping only that exact shape leaves every other reply on the existing renderer path, including multi-line replies and any Markdown that legitimately carries raw HTML.

Rejected:

- Changing only `FILE_READ_USAGE` to escaped text. It fixes one string but leaves `ask` and every other unescaped usage message broken, which the work item explicitly calls out.
- Escaping every reply, or routing all shell replies through the ANSI renderer. Both change how ordinary Markdown and legitimate inline HTML render.
- Matching on a bare placeholder anywhere in the text. It would also rewrite ordinary Markdown that happens to contain `<...>`, whereas the `Usage: ` prefix is the documented shape of a command usage reply.

## Implementation steps

1. `web/src/shared/transcript/markdown.ts`: add a small helper that recognizes a single-line `Usage: ` reply and escapes its angle brackets, then pass its result to `marked.parse`.
2. `web/src/plugins/shell/markdown-block.test.ts`: render the real `FILE_READ_USAGE` through the shell reply block and assert every placeholder and both flags are visible.
3. `web/src/plugins/shell/markdown-block.test.ts`: render `Usage: ask <prompt>.` through the same block and assert the placeholder is visible.
4. `web/src/plugins/shell/markdown-block.test.ts`: render a single-line ordinary Markdown reply and assert its emphasis and link still render as Markdown.
5. `web/src/shared/transcript/markdown.test.ts`: pin the renderer behavior directly for a single-line usage line, an ordinary Markdown line, and a non-usage line whose raw HTML must still be treated as HTML.

## Tests

- `web/src/plugins/shell/markdown-block.test.ts` › file read usage: the visible text contains `<path>`, `--offset`, `<line>`, `--limit`, and `<lines>`.
- `web/src/plugins/shell/markdown-block.test.ts` › ask usage: the visible text contains `<prompt>`.
- `web/src/plugins/shell/markdown-block.test.ts` › ordinary Markdown: a single-line reply still produces a `<strong>` element and an anchor.
- `web/src/shared/transcript/markdown.test.ts` › single-line usage escaping and ordinary Markdown parity.

## Spec and docs

- `product/specs/application-commands.md`: broaden the existing literal-placeholder sentence from the `tab` usage replies to every single-line usage reply, including the shell tab.
- `product/specs/acp.md` already words the full `file read` line; no change needed.
- `help/file.md` already lists the full usage line; no change needed. No user-documentation page describes renderer behavior.

## Out of scope

- Changing `FILE_READ_USAGE`, `parseFileRead`, or any server test.
- Escaping multi-line usage messages or changing how markdown file tabs render their content.
- Any change to `marked`, `DOMPurify`, or the shell tab's reply placement.
