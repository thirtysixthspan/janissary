# Remove rendered response sections from the connection tab

**Complexity: 2/10** — no added production lines across 2 files, 3 requirements, 4 scenarios (p=3.62)

## Goal

In a tracked ACP connection tab, each prompt block currently renders the model's captured replies and its final answer as collapsible Markdown `response` sections after the block's activity. Those responses are already shown to the reader in the shell tab where the prompt was issued, so repeating them in the connection tab is redundant. The connection tab should show the preamble, query, and activity entries only, with no `response` sections and no Markdown-rendered answers.

## Approach

Remove the response rendering path from the connection history component: drop the helper that builds the list of reply and answer texts, drop the JSX that maps them into sections, and drop the `Answer` component. Keep the preamble's Markdown rendering and the container's link routing, which still apply to the preamble. Remove the now-unused `ConnectionBlock` type import and the dead `.connections-answer` CSS selector. Update the connection-tab tests, functional spec, and user documentation to stop describing response sections. No data-model, wire, record, or server change is needed.

## Implementation steps

1. `web/src/plugins/connections/ConnectionHistory.tsx`: remove the `responseTexts` function, the `{responseTexts(block).map(...)}` JSX block, and the `Answer` component; remove `ConnectionBlock` from the `@shared/plugins/connections/shared` type import. Keep `renderMarkdown`, `Preamble`, the `openLink` prop, and the container's `handleClick` link routing.
2. `web/src/plugins/connections/connections.css`: remove `.connections-answer` from the `.connections-prompt, .connections-preamble, .connections-answer` selector.

## Tests

- `web/src/plugins/connections/ConnectionTab.test.tsx`: assert that a block with several captured replies and a final answer renders no `response` sections and no `.connections-answer` elements, and that the reply and answer text does not appear; remove the tests that asserted one section per reply, the appended final answer, no-duplicate behavior, the no-answer fallback, and response collapse persistence; keep and retarget the query collapse-persistence coverage; retarget the link-routing test to a Markdown link in the preamble and keep the activity-text-no-routing assertion; update the header test that expected a rendered answer.

## Spec and documentation

- `product/specs/connections-tab.md`: remove the clauses describing `response` sections for replies and the final answer; keep the preamble/query collapsible description and the activity description; retarget the rendered-link sentence to the preamble.
- `documentation/user-documentation/command-bar/connections.md`: remove the description of reply and final-answer `response` sections and Markdown-rendered replies; retarget the rendered-link sentence to the preamble.
- No `help/` change: no command, flag, or key binding changes.

## Out of scope

- Changing how replies and the final answer are captured on the server, the durable record shape, the connection payload schema, or the tool loop.
- The preamble, query, and activity entry rendering, including their collapsible behavior and Markdown preamble.
- Shell-tab rendering of settled answers, or any other tab's response presentation.
- New wire frames, commands, tabs, or record fields.

## Verification

`$janissary/scripts/run.mjs check-diff` after each implementation step, after tests, and over the complete change set.
