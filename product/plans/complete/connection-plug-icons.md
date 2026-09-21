# Connection plug icons

Issue: in the sessions tab and the metadata bar, for showing the status of a connection, use the plug
icon. The plug should be blue on dark for a detached connection, green on dark for an active
connection, and red on dark for a closed connection. For a button to detach a connection, use the
plug-circle-minus icon; to reattach one, the plug-circle-plus icon; to terminate one, the
plug-circle-xmark icon.

Complexity: 3/10

## Goal

A connection's status and the three verbs that change it currently read as four unrelated glyphs: the
sessions tab spells the state as a word, the metadata row shows nothing but a link icon that doubles
as the detach button, and the two front doors onto detach and reattach share one chain-link glyph
between them. Give the whole vocabulary a single family — the plug — so status is one glyph coloured
by what the connection is doing, and each verb is that plug with the sign of what it does to it.

## Approach

- `web/src/icons.ts` gains the four semantic names, so the glyph choice stays in the one registry
  every component reads it from: `connectionStatusIcon` (`faPlug`), `detachSessionIcon`
  (`faPlugCircleMinus`), `reattachSessionIcon` (`faPlugCirclePlus`), `endSessionIcon`
  (`faPlugCircleXmark`).
- New shared presentational component `web/src/shared/ConnectionPlug.tsx`: props in, one
  `<span class="connection-plug" data-state=…>` out, carrying the plug glyph and the state's name as
  its accessible label and tooltip. It holds no rule worth testing without a render — the colour is
  the stylesheet's, keyed off `data-state` — and it is the one place the five states get their words.
- `web/src/plugins/api.ts` publishes `ConnectionPlug` alongside `ConfirmDialog`, and publishes the
  three action icons. The sessions tab is a client tab plugin, so `web/src/icons.ts` and
  `web/src/shared/` are both closed to it by `eslint.plugin-boundaries.mjs` — the published API is
  the only route, and it is the right one: both front doors onto these actions must draw the same
  glyph. Additive, so `TAB_PLUGIN_API_VERSION` does not move.
- `web/src/theme.css` styles `.connection-plug`, since the metadata row is host chrome and the
  sessions tab renders into the same document. Green (`--success`) for `active`, blue (`--accent`)
  for `detached`, red (`--error`) for `ended`. `provisioning` and `reconnecting` are neither settled
  nor named by the issue, so they stay muted — a connection still landing or still retrying has not
  reached a colour yet.
- `web/src/plugins/sessions/SessionList.tsx` renders the plug ahead of the state word in the State
  column rather than instead of it: blue distinguishes detached from ended at a glance, but not from
  reconnecting, and the column is already 8em wide.
- `web/src/plugins/sessions/sessions.css` lays the State cell out as icon-then-word.
- `web/src/plugins/sessions/SessionRowActions.tsx` swaps `detach`, `reattach` and `end` onto the
  three published action icons. `forget` and `close` keep the trash and cross they already carry:
  neither acts on a connection.
- `web/src/shared/RemoteSessionButton.tsx` swaps its link icon for the same two verb icons, and
  `web/src/shared/AgentTabMeta.tsx` renders `ConnectionPlug` beside the host chip for a remote tab,
  so the metadata row states the connection's status instead of implying it from which button is
  offered.

## Tests

- `web/src/shared/ConnectionPlug.test.tsx` (new): each of the five states renders with that state on
  the element and its own accessible label.
- `web/src/plugins/sessions/sessions-style.test.ts`: the three named states carry their colours.
- `web/src/shared/theme-style.test.ts` equivalent is not available; the plug's colours live in
  `theme.css` and are asserted from a new `web/src/shared/connection-plug-style.test.ts` reading the
  stylesheet as raw text, the way the sessions stylesheet test does.
- `web/src/plugins/sessions/SessionList.test.tsx`: the State cell carries a plug for the row's state
  alongside the state word.
- `web/src/shared/AgentTabMeta.test.tsx`: a remote tab with a session control shows the plug for its
  channel state; a local tab shows none.

## Out of scope

- The row action buttons' own colours. Green Disconnect and red Reconnect were asked for by an
  earlier entry on this branch and are not what this one is about.
- The wording of the actions — Disconnect, Reconnect, End session. The next backlog entry is the
  terminology pass, and renaming here would collide with it.
- The connections status-window button, which already carries a plug for a different thing.

## Specs / docs

`product/specs/sessions-tab.md`: the State column and the metadata row's control described in terms
of the plug and its colours. No help or user-documentation page describes either surface's icons.
