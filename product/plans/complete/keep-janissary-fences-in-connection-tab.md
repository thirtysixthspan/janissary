# Keep janissary fences visible in connection-tab messages

**Complexity: 3/10** — ~37 production lines added in one new helper plus one call site, 4 requirements and 8 test scenarios, 1 new unit (p=4.62)

## Goal

Readers of an ACP connection tab follow the agent's work through the `message` activity sections. A follow-up to the earlier "keep janissary fenced blocks in the displayed reply" change already stopped the server from splicing matched blocks out of the reply text, so the agent's full reply — fences included — now reaches the connection tab. The tab renders each `message` entry through the shared Markdown renderer, and `marked` interprets a ` ```janissary … ``` ` fence as a fenced code block: the literal fence delimiter lines disappear and only the command text survives inside a `<pre><code>` element. A reader therefore can no longer tell which parts of the reply were command blocks. The goal is for a `message` section to show the ` ```janissary ` opening and closing fence lines literally, as the agent wrote them, while the surrounding prose keeps its normal Markdown formatting.

## Approach

Add one pure helper to the connections plugin that escapes only the fence-marker characters on janissary-labelled delimiter lines, and call it immediately before the existing `renderMarkdown` call in `MessageText`. Escaping every backtick or tilde of a delimiter line with a leading backslash makes `marked` treat that line as ordinary paragraph text (rendered with the literal ` ```janissary ` string) rather than opening or closing a code block; the command lines between the two escaped delimiters fall into the same paragraph and stay visible. Everything else — headings, emphasis, lists, links, and code blocks whose info string is not `janissary` — still goes through `renderMarkdown` unchanged.

The helper recognizes fences with the same rules the server extractor uses in `src/acp/command-block.ts`: an opening line is at most three leading spaces followed by three or more backticks or tildes whose info string, trimmed, is exactly `janissary`; a closing line is at most three leading spaces followed by a run of the same marker character, at least as long as the opener, with only trailing whitespace. A small line-by-line state machine tracks the currently open janissary fence so multiple blocks in one reply, and ordinary code blocks interleaved with them, are each handled correctly. Text with no janissary fence passes through unchanged, so ordinary messages keep byte-for-byte the behavior they have today.

## Implementation steps

1. Add `web/src/plugins/connections/janissary-fences.ts` (new, pure, extensionless imports): export `preserveJanissaryFences(text: string): string`, implemented as the line-by-line state machine above. Escape a delimiter line by prefixing each marker character with a backslash and leaving the leading whitespace and the `janissary` info string intact. Keep the whole helper under the 200-line limit.
2. In `web/src/plugins/connections/ConnectionHistory.tsx`, in `MessageText`, pass the message text through `preserveJanissaryFences` before calling `renderMarkdown`. Make no change to the JSON branch, the inline-tool-call branch, the verbatim fallback, the `ActivityText` / tool-part paths, or `Preamble`.
3. No change to the shared `renderMarkdown` in `web/src/shared/transcript/markdown.ts`, to any server code, or to the stored record / wire shape.

## Tests

- `web/src/plugins/connections/janissary-fences.test.ts` (new, colocated, pure unit tests):
  - a single backtick ` ```janissary ` block has its opening and closing delimiter lines escaped while the command line is left verbatim;
  - a `~~~janissary` tilde block is escaped the same way;
  - several janissary blocks in one reply each get both delimiters escaped;
  - a non-janissary fenced code block interleaved with a janissary block is left untouched;
  - prose containing Markdown formatting (emphasis, links) around a block is left untouched;
  - an unclosed janissary fence still gets its opening delimiter escaped;
  - a reply with no janissary fence is returned byte-for-byte unchanged.
- `web/src/plugins/connections/ConnectionTab.test.tsx` (existing — extend the message-rendering suite): a `message` entry whose text is prose plus a ` ```janissary ` command block renders the literal ` ```janissary ` and closing ` ``` ` strings as visible text in `.connections-activity-text`, while the surrounding prose is still rendered from Markdown.

## Spec and documentation

- `product/specs/connections-tab.md`: in the paragraph describing `message` sections rendered from Markdown, add that janissary-labelled command fences in a message keep their literal opening and closing fence lines visible rather than being rendered as a code block, while the rest of the message is still formatted as Markdown.
- `documentation/user-documentation/command-bar/connections.md`: make the same point in the sentence about `message` entries rendering as Markdown.
- No `help/` change: no command, flag, or key binding changes.

## Out of scope

- The stored record shape, wire payload, schema version, and all server-side capture or extraction of command blocks.
- The preamble, query, thought, tool, plan, and permission sections: only `message` entries change.
- The shared Markdown renderer and its other consumers (transcript lines, markdown tabs, conversations, shell replies): the transformation stays local to the connection tab.
- The earlier fix that stopped splicing blocks out of the reply, and the parallel-batch loop behavior: both stay as they are.

## Verification

`$janissary/scripts/run.mjs check-diff` after the helper step, after the call-site step, after the test changes, after the spec and documentation edits, and over the complete change set.
