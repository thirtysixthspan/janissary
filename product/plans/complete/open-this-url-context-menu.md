# Add Open this URL to the default context menu

**Complexity: 3/10** — one client-side menu entry, gated on a pure URL check, that reuses the existing `open <url>` route a clicked Markdown link already takes; no server or protocol change.

## Goal

When the right-clicked selection is a URL, the default context menu offers **Open this URL** directly above **Search for this**. Activating it opens the address in a new page tab, the in-app browser tab `open <url>` creates.

## Approach

The plugin-contributed entries (Search for this, Chat about this) come from static manifest declarations and are offered for every selection. They cannot be conditional on what the selection holds. Rather than add a new declaration field for that, the context-menu feature decides on the client:

- A pure module answers whether a selection is a URL. A URL here is a single token with an explicit `http://` or `https://` scheme that the URL parser accepts, after trimming surrounding whitespace. That matches what `open` itself treats as a web address without the `page` keyword. A bare `example.com` stays plain text, and any other scheme is never offered.
- The selection group (the group after Copy, Paste, and Paste from clipboard…) is assembled by a pure function: Open this URL first when the selection is a URL, then the contributed entries in server order. Because Open this URL needs no server reply, it appears as soon as the menu opens, and the contributed entries join it in the same group when they arrive.
- Activating it sends the `command` RPC with `open <url>`, exactly as clicking a web link in a transcript does, so validation, tab naming, and focus-the-existing-tab behavior all come from the page plugin's existing opener. The menu then closes like any other entry.

## Implementation steps

1. Add `web/src/context-menu/selection-entries.ts` with `selectionUrl(text)` (returns the trimmed URL or `null`) and `selectionEntries(selectionText, contributed, actions)` (returns the selection group's items).
2. In `useDefaultContextMenu.ts`, add `openUrl(url)`, which sends `open <url>` through the `command` RPC and closes the menu.
3. In `DefaultContextMenu.tsx`, build the final group with `selectionEntries` instead of mapping the contributed entries inline.
4. Update `product/specs/context-menu.md` and `documentation/user-documentation/getting-started/context-menus.md`, which document the selection group's entries.

## Tests

- `web/src/context-menu/selection-entries.test.ts`:
  - `selectionUrl` accepts `http` and `https` URLs, trims surrounding whitespace, and rejects plain text, bare domains, other schemes (`javascript:`, `file:`, `ftp:`), text with inner whitespace, and a scheme with no host.
  - `selectionEntries` puts Open this URL before the contributed entries for a URL, omits it otherwise, and wires each item to the right action.
- `web/src/context-menu/DefaultContextMenu.test.tsx`:
  - A URL selection shows Open this URL above Search for this and Chat about this in one group, and activating it sends `open <url>` and closes the menu.
  - Open this URL appears before any contribution reply arrives.
  - A non-URL selection shows no Open this URL.

## Out of scope

- Detecting a URL embedded in a longer selection, or schemeless addresses such as `example.com`.
- Opening the address in the operating system's browser (`open external`).
- Changing the plugin-contributed entries or their declaration contract.
- Adding Open this URL to the Cmd/Ctrl+I shortcut.
