# Route Connection Answer Links Through the Application

**Complexity: 3/10** — one delegated click handler, one callback prop, one focused test, and one spec sentence; no new capability, renderer, or global listener.

## Goal

Clicking a web link in a connection-tab answer opens it through the application's existing `openLink` capability, as an embedded page tab, instead of navigating the whole app window away from its current view.

## Approach

`ConnectionHistory` renders the final answer through `renderMarkdown` and injects the HTML with `dangerouslySetInnerHTML`, and it currently has no anchor-click handling. `TabPluginClientCapabilities` already carries the optional `openLink` capability, which routes `http` and `https` addresses the same way a shell transcript click does.

Attach one React click handler to the history content container. Resolve the nearest `a[href]` from the event target with `closest`, call `event.preventDefault()` whenever an anchor is found so the native navigation is cancelled even when no callback is supplied, then forward the href to an optional callback. `ConnectionTab` always supplies a callback that calls `capabilities.openLink?.(href)`, keeping the direct render safe without adding a global listener, a second Markdown renderer, or a new capability.

## Implementation steps

1. In `web/src/plugins/connections/ConnectionHistory.tsx`, accept an optional `openLink` callback, attach an `onClick` handler to the history content container, find the click's nearest `a[href]`, prevent the default action, and invoke the callback with the anchor's href when one is supplied.
2. In `web/src/plugins/connections/ConnectionTab.tsx`, pass an `openLink` callback to `ConnectionHistory` that calls `capabilities.openLink?.(href)`.
3. Extend `web/src/plugins/connections/ConnectionTab.test.tsx`: expose an `openLink` mock from the setup helper, give an answer an `https://` link, click it, and assert the native action is cancelled and `openLink` is called once with that href. Click plain activity text and assert it is neither cancelled nor routed.
4. Add one sentence to the connection-tab section of `product/specs/connections-tab.md` stating that a web link in a rendered answer opens as a page tab and never navigates the app window.
5. Run `$janissary/scripts/run.mjs check-diff` and fix any failures.

## Tests

- `web/src/plugins/connections/ConnectionTab.test.tsx` — clicking an answer's `https://` link prevents the native navigation and calls `openLink` once with the href; clicking plain activity text does not prevent navigation or call `openLink`.
- The existing shell `markdown-block.test.ts` and transcript `open-link.test.ts` suites remain unchanged and passing.

## Out of scope

- Changing the shell markdown-link handler, transcript link opener, or their tests.
- Adding a capability, a global listener, or a second Markdown renderer.
- Routing links from plain activity entries or other Markdown surfaces.
- Help or user-documentation changes; the visible behavior is already described.
