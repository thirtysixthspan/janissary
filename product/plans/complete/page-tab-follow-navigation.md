# Page tab: follow the address and label as the user navigates inside the embedded page

**Complexity: 4/10** — wires an already-present field through an existing hook and reuses the `navigatePage` RPC (added for the editable-address fix) end to end. No new server code; the bundled extension's content script already reports the live URL.

## Goal

Per the backlog: "the url in the metadata row and the domain on the label of the browser tab should follow the actual url in view as the user navigates." Today, once a page tab loads, its metadata-row address and tab-strip label (root domain) stay frozen at the URL it was opened with, even after the user clicks links and navigates elsewhere inside the embedded page.

## Background (verified)

- `chrome-extension/content-script.js:49` already posts `{ source: SOURCE, url: window.location.href, text }` on every debounced capture (500ms after DOM mutation/scroll) — the **live** URL of whatever page is currently showing inside the iframe. This is the extension's own content script running same-origin *inside* the embedded page, so it can read `window.location.href` freely; the cross-origin restriction that blocks the app's own top-level script from reading iframe content never applies here.
- `web/src/page/usePageContentSync.ts` already receives this `url` field in every message but currently destructures only `{ source, text }` and discards it — the live-URL signal is already arriving, just unused.
- `product/specs/embedded-web-page.md` / `web-pages.md` already document this content-relay path as extension-dependent: it only works "when the app runs in its own managed browser" (where the extension is bundled). When it isn't running, the address/label simply stay static, same as today — this fix cannot and does not change that constraint.
- `src/tab/navigate.ts` `navigatePageTab` (added for the double-click-to-edit fix, already merged) already does exactly what's needed here: validate a target URL the way `open` does, update `tab.page.url`/`tab.page.domain`, and update `tab.title` (the tab-strip label) to the new domain. The `navigatePage` RPC already threads this through `protocol.ts`/`message-handler.ts`/`controller.ts`/`tab/manager.ts`, and `web/src/ws.ts` already exposes `client.navigatePage(index, url)`.
- `web/src/PageTab.tsx` already calls `usePageContentSync(iframeRef, page.url, client)` and already has `index` and `client` in scope, so wiring a navigation callback here needs no new props.

## Approach

Extend `usePageContentSync` to accept an optional `onNavigate(url)` callback, invoked when a capture message's live `url` differs from the hook's own `url` argument (the tab's current `page.url`, i.e. the last URL the server knows about). `PageTab.tsx` passes `(liveUrl) => client.navigatePage(index, liveUrl)` — reusing the exact same validation/update path the manual address-edit feature already uses. When the server accepts the navigation, `page.url`/`page.domain`/`tab.title` update and re-broadcast, so the metadata row's address and the tab-strip label both update automatically through the normal props flow — no client-side state duplication needed. Because `usePageContentSync`'s own `url` argument is `page.url` (a live prop), the hook's effect re-subscribes with the new URL after each accepted navigation, keeping the "is this a new URL?" comparison and the `pageSync` identity key both correct going forward.

## Implementation steps

1. **`web/src/page/usePageContentSync.ts`** — add an optional fourth parameter and act on the message's `url` field:
   ```ts
   export function usePageContentSync(
     iframeRef: React.RefObject<HTMLIFrameElement | null>, url: string, client: JanusClient,
     onNavigate?: (url: string) => void,
   ): void {
     useEffect(() => {
       function handleMessage(event: MessageEvent): void {
         if (event.source !== iframeRef.current?.contentWindow) return;
         const data: unknown = event.data;
         if (!data || typeof data !== 'object') return;
         const { source, text, url: liveUrl } = data as { source?: unknown; text?: unknown; url?: unknown };
         if (source !== SOURCE || typeof text !== 'string') return;
         client.pageSync(url, text);
         if (onNavigate && typeof liveUrl === 'string' && liveUrl !== url) onNavigate(liveUrl);
       }
       window.addEventListener('message', handleMessage);
       return () => window.removeEventListener('message', handleMessage);
     }, [iframeRef, url, client, onNavigate]);
   }
   ```
2. **`web/src/PageTab.tsx`** — pass the callback:
   ```ts
   usePageContentSync(iframeRef, page.url, client, (liveUrl) => client.navigatePage(index, liveUrl));
   ```

## Tests

**Web** — `web/src/page/usePageContentSync.test.ts`, add:
```ts
it('calls onNavigate when the posted url differs from the current one', () => {
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  const ref = React.createRef<HTMLIFrameElement>();
  (ref as { current: HTMLIFrameElement }).current = iframe;
  const { client } = makeClient();
  const onNavigate = vi.fn();
  renderHook(() => usePageContentSync(ref, 'https://example.org', client, onNavigate));

  postMessage(iframe.contentWindow, { source: 'janissary-page-content', url: 'https://example.org/other', text: 'visible text' });
  expect(onNavigate).toHaveBeenCalledWith('https://example.org/other');
  iframe.remove();
});

it('does not call onNavigate when the posted url matches the current one', () => {
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  const ref = React.createRef<HTMLIFrameElement>();
  (ref as { current: HTMLIFrameElement }).current = iframe;
  const { client } = makeClient();
  const onNavigate = vi.fn();
  renderHook(() => usePageContentSync(ref, 'https://example.org', client, onNavigate));

  postMessage(iframe.contentWindow, { source: 'janissary-page-content', url: 'https://example.org', text: 'visible text' });
  expect(onNavigate).not.toHaveBeenCalled();
  iframe.remove();
});
```
`web/src/PageTab.test.tsx` — add a case confirming a content-sync message with a different `url` triggers `client.navigatePage`:
```ts
it('calls navigatePage when the embedded page reports a different URL', () => {
  const client = makeClient();
  const { container } = render(<PageTab page={makePage({ url: 'https://slashdot.org/' })} closeTab={vi.fn()} index={3} client={client} />);
  const iframe = container.querySelector('iframe') as HTMLIFrameElement;
  fireEvent(globalThis, new MessageEvent('message', {
    data: { source: 'janissary-page-content', url: 'https://slashdot.org/story/1', text: 'story text' },
    source: iframe.contentWindow,
  }));
  expect(client.navigatePage).toHaveBeenCalledWith(3, 'https://slashdot.org/story/1');
});
```

Run `./scripts/run.mjs check-diff` after implementing.

## Spec updates

- `product/specs/embedded-web-page.md`'s "Page tab layout" metadata bullet (already updated by the editable-address fix) — add a clause: the address and the tab's root-domain label also update automatically as the user navigates inside the embedded page, when the app's bundled browser extension is active (the same content-relay path the monitor's page-text feature already depends on); without the extension, the address and label stay as they were when the tab was opened.

## Docs

- `documentation/user-documentation/tab-types/web-pages.md` doesn't currently describe the address/label as static or live. Since this changes behavior implicitly relied upon (a previously-static label now updates), and the doc already describes page numbers/labels in a dedicated section, add a short note there: the label's domain follows the page as you navigate within it (when the app is running in its own managed browser).

## Out of scope

- Any change to the extension's content script — it already reports the live URL; only the previously-unused field needs consuming.
- Making this work without the bundled extension (e.g. when the app fell back to the system browser at startup) — the existing text-capture feature already has this same limitation, and this fix doesn't change that.
- Debouncing/throttling — the content script already debounces captures at 500ms; no additional client-side throttling is needed.
