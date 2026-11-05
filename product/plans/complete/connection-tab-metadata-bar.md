# Connection tab metadata bar

Issue: in the connection tab, there should be a metadatabar which contains the host tab id name model state started-time and floated right <stop icon> and <close icon>

Complexity rating: 3/10

## Goal

A connection tab opens with a stacked header: the record's title in bold on its own line, a wrapping line of loose metadata (kind, model, owning tab, status, started and ended times, and an agent run's run id and task path), and then a row of text buttons (**Cancel**, **Close session**, **Terminate**). It doesn't look like any other tab's metadata row, and it doesn't read like the connections list it is opened from. Replace it with one full-width metadata bar holding, in order, the connection's host, owning tab, connection id, connection name, model, state, and started time, with a stop icon and a close icon floated to its right edge.

## Approach

The model is the connections list's own metadata band, which already copies the sessions tab's: `plugin-meta` plus a feature class, `min-height: 28px; padding: 6px 12px; font-size: 12px; border-bottom: 1px solid var(--border)`, with a `plugin-actions` span pushed right by `margin-left: auto` holding icon-only buttons in the muted treatment. The record tab's header takes the same band by joining the list header's selectors (`.connections-record-header, .connections-list-header`), so the two rules can't drift. The record header's own column layout rule goes away.

The fields are the list row's columns, so a reader moving from a row to its tab sees the same facts with the same names: `host`, `ownerName` (Tab), `id` (Connection ID), `recordConnectionName(record)` (Connection Name, `acp:<tab name>` or `agent:<tab name>`), then `model`, `status` (Connection State), and `Started <local time>` in a `<time>` element carrying the ISO timestamp. Bare values such as a UUID are ambiguous on their own, so each field carries a `title` naming it (`Host: Local`, `Connection ID: <uuid>`, ...), the way the harness metadata chips do. The Connection Name's tooltip adds the record's own title (`ACP: …` or `Agent: …`) on a second line, the way a list row's tooltip does, so the record title stays reachable from the tab after it leaves the visible header. The tab's strip title is already the connection name, so the bar doesn't repeat the record title as text.

The entry names exactly what the bar holds, so the ended time, an agent run's run id, and its task path leave the header. The ended time is implied by the state, and the task path is already in an agent record's own title.

The two icons replace the text buttons without changing which actions exist or when:

- **Stop** (`faCircleStop`) stops the work in progress: **Cancel** on a core ACP record while it is `Running`, and **Terminate** on an agent run while it is `Running`. An agent run has no session to close separately from stopping its work, so its one control is the stop icon. It keeps the existing disabled-while-pending behavior.
- **Close** (`faCircleXmark`, the list's Close glyph) closes the connection: **Close session** on a core ACP record while it is `Running` or `Idle`.

Each button keeps its verb as `title` and `aria-label` (`Cancel`, `Terminate`, `Close session`), so the accessible names, the gating, and the intents are unchanged. The `data-action` attribute names the intent, as the list's row buttons do. A closed record still shows no buttons.

No server, wire, or intent change is needed: every field is already on `RecordConnectionRow`.

## Implementation steps

1. `web/src/plugins/connections/ConnectionTab.tsx`: replace the header with the metadata bar, rendering the fields as named spans and the actions as icon buttons. Move the bar into a new `ConnectionTabMeta.tsx` component beside it, so `ConnectionTab` stays about the history, scrolling, and the controller wiring and the bar is testable on its own props. It takes the record, `pendingTerminate`, and the three action callbacks.
2. `web/src/plugins/connections/connections.css`: join `.connections-record-header` to the list header's band and icon-button rules, add a `:disabled` rule for the icon buttons, ellipsize the id and name fields, and remove the record header's column layout, title, metadata, and text-button rules.

## Tests

- `web/src/plugins/connections/ConnectionTab.test.tsx`:
  - the bar shows host, owning tab, connection id, connection name, model, state, and started time in that order, with no ended time, run id, or task path; the record title is not shown as text but is in the connection name's tooltip; each field's tooltip names it;
  - the bar is the tab's first child and its buttons sit in its right-floated `plugin-actions`;
  - a running ACP record shows the stop icon as Cancel and the close icon as Close session, both icon-only (`svg`, no text), in that order; an idle ACP record shows only Close session;
  - a running agent run shows only the stop icon as Terminate;
  - the existing gating, refusal, pending-terminate, and closed-record tests keep passing with the same accessible names.
- `web/src/plugins/connections/connections-style.test.ts`: the record header shares the list header's band and muted icon-button rules, and its disabled buttons are dimmed.

## Out of scope

- A Split control in the bar. Other plugin tabs carry `capabilities.splitAction` in their actions, but the entry names only the stop and close icons, and the record tab never had one.
- Closing the tab itself from the close icon. The close icon closes the connection, as the list's Close does; the tab keeps its ordinary tab close.
- Any change to which lifecycle actions exist, their gating, or their server behavior.

## Specs and docs

- `product/specs/connections-tab.md`: describe the connection tab's metadata bar, its fields and tooltips, and the stop and close icons and which action each carries.
- `documentation/user-documentation/command-bar/connections.md`: the "Connection tabs" section describes the metadata row's contents and its controls; update it to the new fields and icons.
- `help/connections.md`, `help/acp.md`, `help/agent.md`, and the ACP and agent user pages name **Cancel**, **Close session**, and **Terminate**, which keep those names as the icons' labels; no change.
