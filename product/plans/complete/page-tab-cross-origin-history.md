# Page tab back and forward do nothing on a cross-origin page

**Complexity: 4/10** — a message listener in the extension's content script, a message post in place of two cross-origin reads, and a small hook that stops a relayed address from replacing the frame. Tests on both sides, one spec paragraph, one user-documentation paragraph.

## Bug

The back and forward buttons in an embedded web page tab's header do nothing on any real site. They call `contentWindow.history.back()` and `contentWindow.history.forward()`, but the frame is loaded from the site's own origin, and `history` is not a cross-origin accessible window property. Reading it throws inside the click handler, so the button looks inert and nothing reaches the transcript or the notifications feed. It only works when the embedded address is same-origin with the app. The two tests covering the buttons passed only because jsdom's frame is a same-origin `about:blank`.

## Root cause

There are two causes, and the second one hides behind the first.

1. `web/src/plugins/page/PageTab.tsx` reaches across the origin boundary from the parent (`iframeRef.current?.contentWindow?.history.back()`). A browser blocks that for every cross-origin frame.
2. The iframe is keyed on `${page.url}:${reloadNonce}`. With the bundled extension active, every in-page navigation is relayed as a `sync` intent, the server moves the tab's address, and the new key throws the old frame away and loads the new address into a fresh one. The fresh frame has no history of its own. So even a back request that did reach the page would have nothing to step back through. The key was meant for addresses typed into the header, where a fresh frame is right. It was never meant for the addresses the frame reports about itself.

## Correct behavior

Back and forward move the embedded page through its own history on any site, as the buttons' tooltips, `product/specs/embedded-web-page.md`, and `documentation/user-documentation/tab-types/web-pages.md` describe. Like the address and label following in-page navigation, this depends on the bundled browser extension. The bug report prefers this over removing the buttons. An address the page reports about itself leaves the frame, and so its history, where it is. A typed address still loads into a fresh frame. Reload re-fetches the page where it stands now.

## Reproduction

Served two cross-origin fixture pages (`a.html` linking to `b.html`) from `http://127.0.0.1:47811`. Started a separate instance with `node bin/janus.mjs --no-open temp/pagenav/project` (app at `http://127.0.0.1:<port>`, so the fixture is cross-origin). Drove it from the attached browser with `./scripts/run.mjs e2e-driver`: `open http://127.0.0.1:47811/a.html`, clicked the link inside the frame to reach `b.html`, then clicked the header's back and then forward buttons.

- Without the extension: each click raised `Failed to read a named property 'history' from 'Window': Blocked a frame with origin "http://127.0.0.1:<port>" from accessing a cross-origin frame.` as an uncaught page error, and the frame stayed on `b.html`.
- With the content script injected into every frame (standing in for the extension): after the link click the header followed to `b.html`, but the `<iframe>` element had been replaced. Calling `history.back()` from inside the new frame left it on `b.html`.

## Approach

Stop reaching across the origin. The header posts `{ source: 'janissary-page-history', step: 'back' | 'forward' }` to the frame with `postMessage`, which crosses origins freely. The content script already runs in every frame. It gets a `message` listener that obeys only a message whose `event.source` is the app's top window, and only in a frame that is a direct child of the app, and calls `window.history.back()` or `window.history.forward()` on the far side.

Keep the frame when the address came from the frame. A new hook, `usePageFrame`, owns the frame's `src` and a generation counter used as its key. It remembers the last address the frame reported. When the tab's address changes to that address, the frame stays mounted. Any other change loads the new address into a fresh frame. Reload loads the tab's current address into a fresh frame.

## Implementation steps

1. `chrome-extension/content-script.js`: add the `message` listener described above, beside the existing relay.
2. `web/src/plugins/page/usePageFrame.ts`: new hook returning `{ src, key, reload, followFrame }`.
3. `web/src/plugins/page/PageTab.tsx`: post the history step instead of reading `history`. Route the relay's address through `followFrame` before the `sync` intent. Key and load the iframe from the hook, and point reload at the hook.
4. Tests (written test-first, see Regression test).
5. Spec: `product/specs/embedded-web-page.md`, state that back and forward, like the address following, need the bundled extension, and that the page keeps its history as the address follows it.
6. Docs: `documentation/user-documentation/tab-types/web-pages.md`, replace the sentence saying back and forward do nothing on most pages with what they do, and fold their extension dependency into the paragraph that already explains the extension lets the address and label follow navigation.

## Regression test

- `web/src/plugins/page/PageTab.test.tsx`: `clicking back asks a cross-origin embedded page to step back through its own history` and `clicking forward asks a cross-origin embedded page to step forward through its own history`. The frame's `history` getter throws a `SecurityError`, as a cross-origin one does. Both replace the two old same-origin spy tests and failed on `master` with the same error the browser showed.
- `web/src/plugins/page/PageTab.test.tsx`: `keeps the same frame when the address change came from the embedded page itself`, failed on `master` because the frame element was replaced. `loads a typed address into a fresh frame` and `clicking reload re-fetches the address the embedded page has navigated to` guard the two cases where a fresh frame is still right.
- `src/chrome-extension.test.ts`: `content-script.js steps a page tab frame back and forward when the app window asks` (failed on `master`) and `content-script.js ignores a history request from any window but the app`. Both run the script in a `vm` context standing in for a page tab's frame.

## Verification

Re-run the e2e driver against a rebuilt web client with the content script injected, and confirm back returns the frame to `a.html` and forward to `b.html` with no page error. Confirm that without the script the click no longer throws.

## Out of scope

- Making back and forward work without the bundled extension. No cross-origin route exists for that.
- Disabling the buttons when the extension is absent or the page has no history to step through. The parent cannot see either.
- The joint session history that `history.back()` shares across every frame in the window. With several page tabs navigating, a step can land on another tab's most recent navigation, the same as the browser's own back button.
