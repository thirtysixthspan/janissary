# Sessions metadata header

Issue: in the sessions tab, the buttons (refresh and split) should be floated right on the metadata bar, like on the other tabs. the metadata bar on the sessions tab should be styled similar to on agent tabs.

Complexity: 2/10

## Goal

Give the sessions list the same full-width metadata band and right-aligned action placement as host tab metadata rows.

## Approach

- Make the sessions plugin frame and header use the established conversation-list metadata treatment: no inset frame padding, a padded header band, and a bottom border.
- Preserve the shared plugin action group so its automatic left margin keeps Refresh and Split at the right edge.
- Pin the structural styling in the stylesheet test.

## Tests

- `web/src/plugins/sessions/sessions-style.test.ts` checks the full-width metadata-band rules and right-aligned action group.

## Out of scope

- Session row layout and remote-session behavior.

## Specs / docs

- `product/specs/sessions-tab.md` describes the sessions metadata header alignment. No public documentation currently describes this layout.
