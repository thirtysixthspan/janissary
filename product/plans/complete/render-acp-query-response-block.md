# ACP connection tabs show the query response in an expanded block

**Complexity: 3/10** — ~7 added lines in 2 production files (ConnectionHistory render + CSS rule) across 6 behavioral requirements, p=4.47; no new modules or server surface.

## Goal

A connection tab's prompt block currently shows the query and the step-by-step activity but drops the model's final answer: `ConnectionHistory` never renders `block.answer` or `block.replies`, and the spec states the captured replies and final answer are not shown. Show the response to a query in each block as a collapsible section labelled `response`, expanded by default, reading the final answer verbatim like the other sections. The reader can collapse it, and that choice survives streamed updates.

## Design decisions

- A block's final answer is "the response to the query". `replies` holds intermediate stream snapshots (and, from `AcpRecordsManager.answer`, repeats the final answer), so it stays internal: only `block.answer` feeds the new section. A block without an answer — a query still in flight — shows no response section.
- Reuse the existing collapsible treatment: a `<details className="connections-activity connections-response" open>` with a `<summary>response</summary>`, rendered after the query section and before the activity entries so the question and its answer sit together above the detail. `open` makes it expanded by default; like the query section, React reuses the same DOM node across streamed updates so a reader's collapse survives.
- Render the answer as plain text in its own `.connections-response-text` element — no Markdown, matching the query and preamble. Use a distinct class so existing tests that count `.connections-prompt` elements still see only queries.
- Reuse the `.connections-prompt` / `.connections-preamble` wrapping rule for the new text class.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Change |
| --- | --- | --- |
| Prompt block rendering | `web/src/plugins/connections/ConnectionHistory.tsx:10-43` | Add one `response` `<details>` per answered block |
| Verbatim text wrapping rule | `web/src/plugins/connections/connections.css:63` | Add `.connections-response-text` to the selector |
| Query collapse-survives-update pattern | `web/src/plugins/connections/ConnectionTab.test.tsx:48-68,111-121` | Mirror for response |
| Capture/replies data | `src/plugins/connections/shared.ts:14-22` | Unchanged |
| Spec statement that answers are hidden | `product/specs/connections-tab.md:33` | Rewrite |

## Implementation steps

1. In `ConnectionHistory.tsx`, when `block.answer !== undefined`, render a `<details className="connections-activity connections-response" open>` with `<summary>response</summary>` and `<div className="connections-response-text">{block.answer}</div>`, placed after the query `<details>` and before the activity entries.
2. In `connections.css`, add `.connections-response-text` to the `white-space: pre-wrap; overflow-wrap: anywhere;` selector shared by `.connections-prompt` and `.connections-preamble`.

## Tests

- `ConnectionTab.test.tsx`: replace `does not render captured replies or the final answer as response sections` with a case asserting a single expanded `response` section showing the final answer literally (no rendered Markdown) and no separate sections for intermediate replies.
- `ConnectionTab.test.tsx`: a block with no answer renders no `response` section; a reader-collapsed response stays collapsed with its text updated through a streamed rerender.

## Out of scope

- Rendering `block.replies` as separate sections; they remain internal.
- Any change to how records capture, store, or validate answers and replies.
- Markdown rendering, new protocol messages, or controls in the connections list.

## Verification

Run `$janissary/scripts/run.mjs check-diff` to confirm no lint, typecheck, or test regression.
