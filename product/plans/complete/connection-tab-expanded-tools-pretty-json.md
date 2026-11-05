# Expand tool entries and pretty-print JSON in connection tabs

Issue: tool calls hsould be expanded by default in connection tabs. json should be pretty printed.

Complexity rating: 2/10

## Goal

A connection tab's prompt blocks hide every tool entry behind a collapsed disclosure, so following what an agent did means clicking each step open. And a tool entry whose text is JSON, such as a structured tool call or a query result, reads as one long compact line because the activity text collapses whitespace. Tool entries should start expanded, and an entry whose whole text is a JSON object or array should read as indented, multi-line JSON.

## Approach

Both changes live in the connection tab's client rendering, `web/src/plugins/connections/ConnectionHistory.tsx`. The server keeps sending activity text exactly as recorded.

1. **Expanded tool entries.** The tool entry's `<details>` element carries `open` when it mounts. Thought entries stay collapsed, because the entry names tool calls only. The attribute is the element's initial state, not a controlled value: a reader who collapses a tool entry keeps it collapsed through later streamed updates, the same way an expanded thought entry stays expanded today.
2. **Pretty-printed JSON.** A new pure module, `web/src/plugins/connections/activity-text.ts`, exports `prettyJson(text)`. It returns the text re-serialized with two-space indentation when the trimmed text starts with `{` or `[` and parses as JSON, and `undefined` otherwise. The history renders a returned value in a `<pre className="connections-activity-json">` and keeps every other entry's text as it renders now. This applies to every activity kind, because `src/acp/activity.ts` serializes non-text plan and permission updates as JSON too, and it covers records saved before this change.

Pretty-printing on the client matches how the tab already renders the final answer's Markdown there: it is a display transform of the recorded text, not a second computation of state the server owns. Doing it on the server was rejected because records already on disk hold compact JSON, and the recorded text is also the agent monitor's and remote host's activity, which this entry does not ask to change.

## Implementation steps

1. Add `web/src/plugins/connections/activity-text.ts` with `prettyJson(text: string): string | undefined`.
2. In `ConnectionHistory.tsx`, render each entry's content through `prettyJson`, using a `<pre className="connections-activity-json">` for JSON, and give the tool entry's `<details>` the `open` attribute.
3. In `connections.css`, style `.connections-activity-json` to keep its indentation, wrap long lines, use the inherited font size, and drop the browser's default `pre` margin.

## Tests

- `web/src/plugins/connections/activity-text.test.ts`: an object and an array are re-indented with two spaces; text with surrounding whitespace still pretty-prints; plain text, a JSON string or number, malformed JSON, and text that only starts with a brace return `undefined`.
- `web/src/plugins/connections/ConnectionTab.test.tsx`: update the first test so the tool entry's disclosure is open and the thought entry's is still closed.
- `web/src/plugins/connections/ConnectionTab.test.tsx`: a tool entry whose text is compact JSON renders the indented JSON in a `pre`, and a plain-text entry renders unchanged without one.
- `web/src/plugins/connections/ConnectionTab.test.tsx`: a tool entry the reader collapses stays collapsed after the record rerenders with a streamed update.
- `web/src/plugins/connections/connections-style.test.ts`: `.connections-activity-json` preserves whitespace.

## Out of scope

- The agent monitor's activity rendering and the recorded activity text itself.
- Syntax highlighting of JSON.
- The remaining pull-request backlog entries (last activity for every connection type, a UUID for every connection type, the focus button in the connection metadata row, and the table header wording).

## Specs and docs

- `product/specs/connections-tab.md`: thought entries start collapsed and tool entries start expanded; an entry whose text is a JSON object or array reads as indented JSON.
- `documentation/user-documentation/getting-started/tabs.md`, `documentation/user-documentation/advanced-agents/acp-agent.md`, and `documentation/user-documentation/advanced-agents/markdown-rendering.md`: each says thought and tool entries start collapsed; correct them so thought entries start collapsed and tool entries start expanded.
