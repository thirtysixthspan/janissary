# Render embedded tool calls in connection-tab activity text

**Complexity: 5/10** — ~87 added lines across 3 existing feature files plus a parser and a component, 6 requirements and 10 scenarios (p=5.45).

## Goal

Some agents emit their tool calls as inline XML inside an `agent_message_chunk` rather than as a native ACP `tool_call` update. A record stores that chunk as one `message` entry, so the connection tab shows the whole thing as a single paragraph: prose such as `I'll explore the workspace…` runs straight into `<function_calls><invoke name="bash"><parameter name="command">…</parameter></invoke></function_calls>`. The markup is unstyled and the parameter values are hard to pick out, which is especially bad because these calls are the record of what the agent actually did. Calls that begin a block read the same way as calls embedded mid-line, because nothing in the view looks at the text between the tags.

Make the connection tab render each `<function_calls>` block as a labelled tool call with its tool name and parameters, whether the block starts the entry text or is surrounded by prose, while leaving every entry with no such block exactly as it reads today.

## Approach

Keep this in the connections feature. The server already owns the recorded text; this is view-local formatting, the same kind the tab already does when it pretty-prints a JSON activity entry or renders a Markdown answer. Add a pure parser to `activity-text.ts` beside `prettyJson` that splits entry text into plain-text segments and tool-call segments. The parser scans with `matchAll`, so it finds a `<function_calls>` block anywhere in the text, not only at the start of a line, and it keeps the prose before and after each block as text segments. Each block yields its `<invoke>` calls, each with its `<parameter>` name/value pairs, with the five common XML entities decoded in the values so a command that used `&quot;` or `&amp;` reads as the agent meant it. A block that has no well-formed `<invoke>` is left as raw text rather than swallowed.

A small presentational component renders the parsed calls; it takes only the parsed data as props and holds no state. `ConnectionHistory`'s `ActivityText` composes the segments. Entries whose text has no tool calls still take the existing `prettyJson` path unchanged, so JSON tool entries keep their indented rendering and plain entries keep their verbatim rendering.

## Implementation steps

1. **`web/src/plugins/connections/activity-text.ts`** — add the parsed-call and segment types, the entity decoder, and `parseToolCalls(text)`. Keep `prettyJson` untouched.
2. **`web/src/plugins/connections/ToolCallBlock.tsx`** (new) — presentational component that renders one tool-call segment as a labelled name and one line per parameter.
3. **`web/src/plugins/connections/ConnectionHistory.tsx`** — in `ActivityText`, call `parseToolCalls`, render text segments verbatim and tool-call segments through `ToolCallBlock`, and keep the `prettyJson` branch for entries with no tool calls.
4. **`web/src/plugins/connections/connections.css`** — add rules for the tool-call name and parameter lines next to the existing activity rules, above the narrow-list section, muted like the other activity labels and wrapping long parameter values.

## Tests

- `web/src/plugins/connections/activity-text.test.ts` (new) — `parseToolCalls` returns one verbatim text segment when there are no tags; finds a call at the start of the text; finds a call embedded mid-line after prose and keeps the prose on both sides; reads multiple invokes in one block and their named parameters; finds multiple blocks separated by prose; decodes the five common entities in parameter values; leaves an unclosed or invoke-less block as raw text.
- `web/src/plugins/connections/ConnectionTab.test.tsx` — an activity entry whose text is prose plus an inline `<function_calls>` block renders the surrounding prose and a tool-call block with the invoke name and parameter value; a plain tool entry still pretty-prints its JSON and a plain message entry still shows its text verbatim.
- `web/src/plugins/connections/connections-style.test.ts` — asserts the new tool-call rules exist and keep long parameter values wrapping.

## Out of scope

- Changing how the server records ACP activity or how the tool loop extracts commands for execution. The recorded text is untouched.
- Parsing other agent tool-call dialects, native `tool_call` updates, or Markdown answers.
- New user documentation: only the one existing sentence that described activity entries as always verbatim is corrected; no new command, flag, or behavior page is added. The spec is updated to state the new behavior.
