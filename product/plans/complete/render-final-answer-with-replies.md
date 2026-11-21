# Render the final answer alongside captured replies in the connection tab

**Complexity: 2/10** — one renderer change (~8 added lines in 1 production file), 4 requirements and 5 test scenarios; the work is a single list-composition edit in an existing component (p=4.15)

## Goal

In a tracked ACP connection launched from a shell by `ask` or `tell`, the model can make more than one response during a single prompt: an early reply before other tool commands have settled, then follow-up replies as their results arrive. Those intermediate replies are captured on the connection block and rendered in the connection tab, but the block's final answer — the model's closing response to the caller — is not rendered whenever any reply was captured. When the loop ends with a capped run or another settlement whose text differs from the last captured reply, that closing text never appears in the connection tab. Every response the model makes to the caller should be rendered, in arrival order, including the final one.

## Approach

Keep the existing `replies` array as the ordered list of model replies and the existing `answer` field as the settled final answer. In the connection tab's history renderer, build the list of responses to show from both: every captured reply in order, plus the final answer as one more response when an answer exists and is not already the last captured reply. This keeps normal answered runs unchanged, where the final answer was already captured as the last reply, while ensuring a closing answer that differs — such as a step-cap notice — is still shown. Records that predate reply capture still fall back to their single answer. No data-model, wire, record, or server change is needed.

## Implementation steps

1. `web/src/plugins/connections/ConnectionHistory.tsx`: compute the response texts for a block as its `replies` when present, otherwise its single `answer`; when an `answer` is present and is not the last entry of that list, append it as a final response.
2. Render that combined list with the existing `Answer` component and the existing per-index keys, preserving the Markdown path and the `response` section label.

## Tests

- `web/src/plugins/connections/ConnectionTab.test.tsx`: a block whose captured replies end in text that differs from its `answer` renders the final answer as a further expanded Markdown `response` section after the replies; a block whose last reply equals its answer still renders exactly one section for it and does not duplicate it; a block with only `answer` still renders one section; a block with several replies and no answer still renders them all in order.

## Spec and documentation

- `product/specs/connections-tab.md`: state that a block renders every captured reply followed by its final answer whenever that answer differs from the last reply, so the closing response is always shown, while a block with no replies still shows its single answer once.
- No `help/` change: no command, flag, key binding, or documented user behavior changes. No user-documentation change: the connection tab's per-response sections are not described there beyond the existing ordering, which does not change.

## Out of scope

- Changing how replies are captured on the server, the durable record shape, the connection payload schema, or the tool loop's batching, result pump, and settlement.
- Changing the preamble, query, or tool activity rendering, or the collapsible presentation of response sections.
- Reordering replies relative to activity entries; replies still render after a block's activity.
- New wire frames, commands, tabs, or record fields.

## Verification

`$janissary/scripts/run.mjs check-diff` after each implementation step, after tests, and over the complete change set.
