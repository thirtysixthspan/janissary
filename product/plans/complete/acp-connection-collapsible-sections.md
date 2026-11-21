# Collapsible preamble, query, and response sections in the connection tab

**Complexity: 3/10** — ~20 added lines in 1 production file, 4 requirements, 6 scenarios, no new units (p=4.39)

## Goal

A tracked ACP connection tab currently shows each prompt block as a plain query, the one-time transport preamble as a plain Markdown section *below* the query, and each model reply as a plain Markdown answer. A reader cannot collapse any of them, and the context the model was given sits in the middle of the block rather than at its top. The preamble should appear first as a collapsed section a reader can expand, and the query and every model response should appear as expanded sections a reader can collapse, all using the same collapsible presentation as the tool section.

## Approach

Reuse the existing tool-section collapsible treatment: a `<details className="connections-activity">` with a muted `<summary>` label. The preamble becomes the first child of each block's article, in a details with summary `preamble` and no `open` attribute so it starts collapsed. The query moves into a details with summary `query` and `open` so it starts expanded, keeping its plain text inside the existing `.connections-prompt` element. Each rendered reply moves into its own details with summary `response` and `open`, keeping the existing Markdown rendering path and `.connections-answer` element. The activity entries between query and replies stay exactly as they are. No data model, wire, or record change is needed: every piece is already present on the connection block.

## Implementation steps

1. `web/src/plugins/connections/ConnectionHistory.tsx`: render the block's preamble first, then the query, then the activity entries, then the replies.
2. Wrap the preamble content in a collapsed `<details className="connections-activity">` with `<summary>preamble</summary>`; keep the `Preamble` Markdown rendering and `.connections-preamble` element inside it.
3. Wrap the query in an expanded `<details className="connections-activity" open>` with `<summary>query</summary>`; keep the `.connections-prompt` element and its text inside it.
4. Wrap each answer in an expanded `<details className="connections-activity" open>` with `<summary>response</summary>`; keep the `Answer` Markdown rendering and `.connections-answer` element inside it.
5. No CSS change: the existing `.connections-activity` and `.connections-activity summary` rules already style these sections after the collapsible tool section, including the muted label.

## Tests

- `web/src/plugins/connections/ConnectionTab.test.tsx`: preamble renders first in the block, in a collapsed `details` whose summary reads `preamble`; the query is in an expanded `details` whose summary reads `query`; the single fallback answer and every reply in a multi-reply block are each in an expanded `details` whose summary reads `response`; a reader's toggle on these sections survives a streamed rerender; a web link in a rendered answer still routes through `openLink`.

## Spec and documentation

- `product/specs/connections-tab.md`: state that each block shows its preamble first in a collapsed `preamble` section, then its query in an expanded `query` section, then its activity, then each reply in an expanded `response` section, all in the tool section's collapsible style.
- `documentation/user-documentation/command-bar/connections.md`: describe the same ordering and collapsible labels for the connection tab.
- No `help/` change: no command, flag, or key binding changes.

## Out of scope

- The stored record shape, wire payload, schema version, and all server-side capture of preambles, prompts, replies, and activity.
- The activity entries and their tool/thought collapse behavior.
- Markdown rendering of the query text, which stays plain as recorded.
- New sections beyond preamble, query, and response.

## Verification

`$janissary/scripts/run.mjs check-diff` after each implementation step, after tests, and over the complete change set.
