# Web links in transcript open as page tabs

**Complexity: 4/10** — add a click handler to the Markdown component, wire it to the existing `open` command infrastructure; two source files touched.

## Goal

Clicking a web link (http/https) in the agent transcript's Markdown-rendered output opens the URL as an in-app page tab instead of navigating the app away from its own page. Currently, clicking a link in rendered Markdown navigates the entire app to the external URL, disconnecting the WebSocket and losing all state.

## Background

The transcript renders Markdown output via `renderMarkdown()` in `web/src/markdown.ts` (marked + DOMPurify). The resulting HTML is inserted via `dangerouslySetInnerHTML` in a `<div>` with no click handler. Links rendered as `<a href="...">` have no `target` attribute (DOMPurify strips it by default). Clicking such a link causes the app page to navigate away — a destructive operation.

The `open <url>` command already opens web pages as page tabs (via `webOpener.inline()` → `openPageTab()`). The client already has a `client.send({ method: 'command', params: { text } })` mechanism for sending commands to the server.

## Approach

Add an `onClick` handler to the Markdown component's container `<div>`. Use event delegation — when a click's target or ancestor is an `<a>` element with an `http`/`https` `href`, prevent the default navigation and send `open <url>` as a command through the WebSocket. The server processes it exactly as if the user typed `open <url>`, creating a page tab with the URL.

## Implementation steps

1. **Add `onLinkClick` prop to the `Markdown` component** — accept a callback `(url: string) => void`.
2. **Add click handler** — use `onClick` on the markdown div. Find the nearest `<a>` ancestor via `e.target.closest('a')`. If found and `href` starts with `http:` or `https:`, call `e.preventDefault()` and `onLinkClick(href)`.
3. **Wire in `renderLine`** — create a lambda `(url) => client.send({ method: 'command', params: { text: 'open ' + url } })` and pass it to `Markdown`.
4. **Run `./scripts/run.mjs check-diff`**.

## Testing

- `web/src/transcript-line.test.tsx` — add a test that clicks a link in rendered Markdown and verifies that `client.send()` is called with `{ method: 'command', params: { text: 'open https://example.com' } }`.
- Verify that clicking a non-link in Markdown does not trigger a command.

## Out of scope

- Intercepting links in page tab iframes (cross-origin limitations).
- Intercepting links in the external Playwright Chromium browser.
- Rewriting links to add `target` attributes at render time.

## Verification

`./scripts/run.mjs check-diff` must pass clean. Manual: send a message containing a Markdown link (e.g. `msg agent2 Check out [this link](https://example.com)`), then click the link in the transcript — a new page tab should open with the URL.
