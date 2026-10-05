# Shell reply link clicks

**Complexity: 4/10** — one optional client capability, one pure helper shared with the transcript, and a click listener on the reply decoration; no server or wire change.

## Goal

Clicking a link inside a shell tab's rendered markdown reply (a `help` reply, for one) opens it the way the same link opens in an agent tab's transcript, instead of navigating the whole Janissary window away.

## Current state

- `web/src/plugins/shell/markdown-block.ts` fills each reply decoration with `innerHTML` from `renderMarkdown`, and `.shell-output-block` sets `pointer-events: auto`, but nothing listens for clicks. A click on an `<a href="https://…">` follows the link in the app window.
- The transcript's `Markdown` component in `web/src/shared/transcript/transcript-line.tsx` intercepts anchor clicks: an `http(s)` href is sent as `open <href>`, a `path:line` href as `edit <href>`, through `transcriptIntents` (`web/src/shared/transcript/transcript-intents.ts`). The routing rule is split between the component's click filter and `renderMarkdownLine`.
- A plugin cannot reach that path: `TabPluginClientCapabilities` in `web/src/plugins/api.ts` deliberately withholds the client, and no capability opens a link.

## Approach

Lift the transcript's link routing into one pure helper, `openTranscriptLink(href, intents)` in `web/src/shared/transcript/open-link.ts`, which calls `onOpenFile` for an `http(s)` href, `onEditFile` for a `path:line` href, and answers whether it routed the link. The transcript uses it in place of its two-part rule.

The two parts disagreed about order: the click filter tested for a web link first, but the routing callback tested for `path:line` first, so a web address ending in `:12` (`https://host/src/a.ts:12`) was sent to `edit`. The helper tests the web link first, which is the order the transcript's plain output lines already use (`fileLineSegments` claims URLs before file references). That one case changes in the transcript, and `product/specs/transcript.md` says so.

Publish an optional `openLink(href)` on the plugin client capabilities, implemented with that helper over `transcriptIntents(client)`. It is optional, like `attachTerminal` and `openFileNavigator`, so the plugin fixtures that build a capability object are unchanged and `TAB_PLUGIN_API_VERSION` does not move. A capability rather than a published function because opening needs the client, which a plugin never holds.

`insertMarkdownBlock` takes a link opener and, when it fills a decoration, adds one click listener: a click inside an `a[href]` within the block is always `preventDefault`ed — the decoration must never navigate the app window — and the href is handed to the opener. `useShellTerminal` reads the opener through a ref (the capability object is rebuilt on every visibility change) and `useShellTabTerminal` passes `capabilities.openLink`.

Rejected: preventing default only for links the opener routes, as the transcript does. A shell reply has no reason to navigate the app window for any href, so the block refuses all of them and opens the ones the application knows how to open.

## Implementation steps

1. Add `web/src/shared/transcript/open-link.ts` with `openTranscriptLink`, and use it from `transcript-line.tsx` (`Markdown` prevents default only when the helper routed the link).
2. Add the optional `openLink` capability to `TabPluginClientCapabilities` and implement it in `createPluginClientCapabilities`.
3. Add the opener parameter to `insertMarkdownBlock` and the click listener in its `fill`.
4. Thread the opener through `useShellTerminal` (as a ref-read option) and `useShellTabTerminal`.
5. Update `product/specs/shell-tab.md` and `product/specs/transcript.md`.

## Tests

- `web/src/shared/transcript/open-link.test.ts`: an `https` href calls `onOpenFile`; a `path:line` href calls `onEditFile`; an `https` href ending in `:12` still opens rather than edits; any other href calls neither and answers `false`.
- `web/src/plugins/api.test.ts`: `openLink` sends `open <url>` for a web link, `edit <path:line>` for a file-line link, and nothing for another href.
- `web/src/plugins/shell/markdown-block.test.ts`: clicking an anchor inside a filled decoration prevents the default action and calls the opener with its href; clicking outside an anchor calls nothing and leaves the default alone.
- Existing transcript link-click tests keep passing.

## Spec

`product/specs/shell-tab.md`: a link in a reply rendered as HTML opens the way it opens from an agent tab's transcript, and never navigates the application window.

`product/specs/transcript.md`: a web address is never treated as a `file:line` link, even when it ends in `:<digits>`.

## Out of scope

- Linkifying bare `path:line` text in shell replies (the transcript's `linkifyMarkdown`); only anchors the markdown itself produces are handled.
- Running the opened command in the shell tab rather than the current tab; the transcript's path uses the current tab and this matches it.
- Updating `documentation/developer-documentation/tab-plugins.md`'s capability list, which this task's scope does not cover; it should gain an `openLink(href)` bullet in a follow-up.
