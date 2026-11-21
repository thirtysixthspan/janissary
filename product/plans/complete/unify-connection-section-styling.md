# Give every connection-tab section the same styling

**Complexity: 1/10** — one CSS rule in 1 production file, one styling requirement, 2 test scenarios, no new units (p=2.92)

## Goal

In an ACP connection tab, each prompt block presents its content as sections: the one-time preamble, the query, and the activity entries (message, thought, tool, plan, permission). Today the preamble and query content is wrapped in a raised panel — `padding`, a rounded `border-radius`, and `background: var(--bg-soft)` — while the tool, thought, and message sections render on the default (page) background with only a left border. The sections therefore do not read as one consistent set. Every section should share the same visual treatment, including the default background color, so a reader sees one uniform look whichever section kind a record contains.

## Approach

Every section container already carries the shared `.connections-activity` class, which supplies the uniform left border and padding. The one-off raised panel comes entirely from the `.connections-prompt, .connections-preamble` rule used by the preamble's and query's inner content wrappers. Remove that rule's `padding`, `border-radius`, and `background` declarations so those two wrappers fall back to the same default background and text treatment the other sections already use, and keep only text wrapping. No component, data-model, wire-payload, or rendering-path change is needed: the sections, their labels, and their content stay exactly as they are, only the visual box is dropped.

## Implementation steps

1. `web/src/plugins/connections/connections.css`: in the `.connections-prompt, .connections-preamble` rule, remove `padding: 10px`, `border-radius: 4px`, and `background: var(--bg-soft)`, retain `white-space: pre-wrap`, and add `overflow-wrap: anywhere` so long preamble and query text wraps like the other section text. Leave the `.connections-activity` rule (the shared section container) unchanged.
2. No change to `web/src/plugins/connections/ConnectionHistory.tsx`: the preamble, query, tool, thought, and message sections already share `.connections-activity`, so removing the one-off panel makes them uniform without touching the component.

## Tests

- `web/src/plugins/connections/connections-style.test.ts` (existing — extend the style suite):
  - the `.connections-prompt, .connections-preamble` rule keeps `white-space: pre-wrap` and `overflow-wrap: anywhere` but declares no `background`, `border-radius`, or `padding` — the preamble and query no longer get a raised, tinted panel;
  - the section container rule `.connections-activity` still supplies the shared treatment (`border-left: 2px solid var(--border)` and `padding-left: 10px`), so every section kind continues to use one common style, and the only `background: var(--bg-soft)` left in the stylesheet belongs to the selected list row rather than to any section.
- Mirror the existing regex-based CSS assertion style; no new test file.

## Spec and documentation

- `product/specs/connections-tab.md`: state in the connection-tab paragraph that all sections share the same styling, including the default background color, with none raised or tinted differently from the rest.
- `documentation/user-documentation/command-bar/connections.md`: make the same statement in its connection-tabs section.
- No `help/` change: no command, flag, or key binding changes.

## Out of scope

- The stored record shape, wire payload, schema version, and all server-side capture of activity.
- Which sections exist, their order, their collapse defaults, and their labels — the earlier fixes established those and this change does not revisit them.
- Section content formatting: Markdown rendering of the preamble, JSON pretty-printing, and inline `<function_calls>` rendering stay as they are.
- The connections list, its rows, and the metadata bar; the fix concerns only the sections inside a connection tab's prompt blocks.

## Verification

`$janissary/scripts/run.mjs check-diff` after the implementation step, after the test changes, after the spec and documentation edits, and over the complete change set.
