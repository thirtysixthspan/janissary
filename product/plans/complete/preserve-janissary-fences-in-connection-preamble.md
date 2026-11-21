# Preserve janissary fences in the connection-tab preamble

**Complexity: 1/10** — 1 production line added in one existing file, 2 requirements and 3 test scenarios, 0 new units (p=3.313)

## Goal

The connection tab renders two kinds of text through the shared Markdown renderer: a `message` entry's text and a prompt block's preamble. The earlier "keep janissary fences visible in connection-tab messages" change escaped janissary-labelled fence delimiter lines before rendering a `message`, so the agent's literal ```janissary opening and closing fence lines stay visible while the surrounding prose keeps its Markdown formatting. The preamble was deliberately left out of that change. Since the ACP tool primers now show a fenced, one-command example for every documented command, the stored preamble contains real ```janissary blocks. The tab renders the preamble with `renderMarkdown` directly, so `marked` consumes those fences into code blocks and hides the literal delimiter lines. A reader cannot see that the example is a janissary command fence. The goal is for every Markdown-rendered surface in the connection tab — the preamble included — to keep janissary fence delimiter lines visible as literal text while all other Markdown still renders normally.

## Approach

Apply the same `preserveJanissaryFences` helper already used by `MessageText` to the preamble before calling `renderMarkdown`. The helper is a pure line-by-line transformation that escapes only the marker characters on janissary-labelled opening and closing fence lines, so `marked` treats them as ordinary paragraph text and the literal ```janissary string stays visible. Text with no janissary fence passes through byte-for-byte unchanged, so a preamble made of ordinary Markdown keeps its current formatting. No change is needed to `MessageText`, which already preserves fences; routing both render sites through the helper makes "all Markdown in the connection tab" consistent.

## Implementation steps

1. In `web/src/plugins/connections/ConnectionHistory.tsx`, in `Preamble`, pass the preamble text through `preserveJanissaryFences` before `renderMarkdown` (matching `MessageText`). Make no change to the JSON branch, the inline-tool-call branch, the query, the thought/tool/plan/permission paths, or the verbatim fallback.
2. No change to `web/src/plugins/connections/janissary-fences.ts`: the existing helper already handles backtick and tilde fences, several blocks, interleaved code fences, and unclosed fences.
3. No change to the shared `renderMarkdown` in `web/src/shared/transcript/markdown.ts`, to any server code, or to the stored record / wire shape.

## Tests

- `web/src/plugins/connections/ConnectionTab.test.tsx` (existing — extend the preamble-rendering suite):
  - a preamble whose text is prose plus a ```janissary command block renders the literal ```janissary opening and closing fence lines and the command text as visible text in `.connections-preamble`, with no `<pre>` code block;
  - a preamble with a `~~~janissary` tilde block keeps its literal tilde fence lines visible;
  - a preamble with ordinary Markdown (emphasis, lists) and no janissary fence still renders that Markdown, passing through unchanged.
- `web/src/plugins/connections/janissary-fences.test.ts` (existing): no change needed — the helper's behavior is already covered there.

## Spec and documentation

- `product/specs/connections-tab.md`: extend the paragraph describing preamble Markdown so a `janissary`-labelled command fence in the preamble keeps its opening and closing fence lines visible as literal text, matching the message behavior already stated there.
- `documentation/user-documentation/command-bar/connections.md`: make the same point where the preamble's Markdown rendering and the message janissary-fence behavior are described.
- `help/connections.md`: make the same point in the sentence about janissary fences in messages and the preamble.

## Out of scope

- The stored record shape, wire payload, schema version, and all server-side capture or generation of command blocks and primers.
- The query, thought, tool, plan, permission, and answer sections: only Markdown-rendered text (message and preamble) uses `preserveJanissaryFences`.
- The shared Markdown renderer and its other consumers (transcript lines, markdown tabs, conversations, shell replies): the transformation stays local to the connection tab.
- The parallel-batch loop behavior and the earlier message-side fence fix: both stay as they are.

## Verification

`$janissary/scripts/run.mjs check-diff` after the call-site step, after the test changes, after the spec and documentation edits, and over the complete change set.
