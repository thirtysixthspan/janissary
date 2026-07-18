# Back, forward, and reload buttons in the page tab's metadata row

**Complexity: 3/10** — three new icon buttons and their handlers, confined to `web/src/PageTab.tsx`/`web/src/theme.css`, using the embedded iframe's `contentWindow.history` (cross-origin-accessible per the HTML spec) for back/forward and a remount-based reload. No server/protocol change.

## Goal

The page (browser) tab's metadata row currently shows only the page's URL and a close button. Per the backlog, add **back**, **forward**, and **reload** icon buttons, left-floated in the metadata row (i.e. at the start of `.page-meta`, before the URL text).

## Background (verified)

- `web/src/PageTab.tsx` already holds an `iframeRef` to the embedded `<iframe>`.
- The `History` interface's `back()`, `forward()`, `go()`, and `length` are on the HTML spec's cross-origin-accessible allowlist for `Window.history` — calling `iframeRef.current.contentWindow.history.back()` / `.forward()` from the parent frame is permitted even when the embedded page is a different origin, and does not read or script the page's content (unlike `location.reload()`, which is **not** on that allowlist and throws `SecurityError` cross-origin).
- Reload therefore can't use `contentWindow.location.reload()`. The standard cross-origin-safe technique is to force the iframe to remount with the same `src` — done here via a `reloadNonce` counter passed into the iframe's `key`, incremented on click. This is a DOM-level operation on the app's own iframe element, not scripting into the embedded page.
- `product/specs/embedded-web-page.md` currently states the app "does not communicate with, control, script, or read the contents of the embedded page" (with an explicit monitor-attached exception for reading visible text). Back/forward/reload buttons are a **deliberate, requested exception for navigation control only** — they never read or script the page's contents. The spec needs a short carve-out noting that navigation (back/forward/reload) is host-controlled, distinct from reading/scripting content.

## Approach

Add three buttons — `page-back`, `page-forward`, `page-reload` — as a new `.page-nav` group, the first child of `.page-meta` (so it renders left of the URL text). Style them like the existing `.page-close`/`.monitor-snapshot` icon buttons (transparent background, `var(--muted)` color, `var(--fg)` on hover). Use `faArrowLeft`/`faArrowRight`/`faRotateRight` from the existing solid icon set (`web/src/icons.ts`), added as `pageBackIcon`/`pageForwardIcon`/`pageReloadIcon`.

## Implementation steps

1. **`web/src/icons.ts`** — add to the solid re-export block:
   ```ts
   faArrowLeft as pageBackIcon,
   faArrowRight as pageForwardIcon,
   faRotateRight as pageReloadIcon,
   ```
2. **`web/src/PageTab.tsx`**:
   - Add `const [reloadNonce, setReloadNonce] = useState(0);`.
   - Add handlers:
     ```ts
     const goBack = () => iframeRef.current?.contentWindow?.history.back();
     const goForward = () => iframeRef.current?.contentWindow?.history.forward();
     const reload = () => setReloadNonce((n) => n + 1);
     ```
   - Render a `.page-nav` group as the first child of `.page-meta`, before `.page-url`:
     ```tsx
     <div className="page-nav">
       <button type="button" className="page-back" title="Back" aria-label="Back" onClick={goBack}>
         <FontAwesomeIcon icon={pageBackIcon} />
       </button>
       <button type="button" className="page-forward" title="Forward" aria-label="Forward" onClick={goForward}>
         <FontAwesomeIcon icon={pageForwardIcon} />
       </button>
       <button type="button" className="page-reload" title="Reload" aria-label="Reload" onClick={reload}>
         <FontAwesomeIcon icon={pageReloadIcon} />
       </button>
     </div>
     ```
   - Give the `<iframe>` `key={reloadNonce}`, forcing a full remount (fresh load of `page.url`) each time `reload` fires.
3. **`web/src/theme.css`** — near `.page-close` (`:217-219`), add:
   ```css
   .page-nav { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
   .page-back, .page-forward, .page-reload {
     background: transparent; border: none; color: var(--muted); cursor: pointer; font-size: 13px;
     padding: 0 4px; line-height: 1;
   }
   .page-back:hover, .page-forward:hover, .page-reload:hover { color: var(--fg); }
   ```

## Tests

`web/src/PageTab.test.tsx`:

```ts
it('renders back, forward, and reload buttons before the URL', () => {
  const { container } = render(<PageTab page={makePage()} closeTab={vi.fn()} index={0} client={makeClient()} />);
  const meta = container.querySelector('.page-meta')!;
  const nav = meta.querySelector('.page-nav')!;
  expect(nav.querySelector('.page-back')).not.toBeNull();
  expect(nav.querySelector('.page-forward')).not.toBeNull();
  expect(nav.querySelector('.page-reload')).not.toBeNull();
  expect(nav.compareDocumentPosition(meta.querySelector('.page-url')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it('clicking back calls history.back on the embedded frame', () => {
  const { container } = render(<PageTab page={makePage()} closeTab={vi.fn()} index={0} client={makeClient()} />);
  const iframe = container.querySelector('iframe') as HTMLIFrameElement;
  const back = vi.spyOn(iframe.contentWindow!.history, 'back').mockImplementation(() => {});
  fireEvent.click(container.querySelector('.page-back') as Element);
  expect(back).toHaveBeenCalled();
});

it('clicking forward calls history.forward on the embedded frame', () => {
  const { container } = render(<PageTab page={makePage()} closeTab={vi.fn()} index={0} client={makeClient()} />);
  const iframe = container.querySelector('iframe') as HTMLIFrameElement;
  const forward = vi.spyOn(iframe.contentWindow!.history, 'forward').mockImplementation(() => {});
  fireEvent.click(container.querySelector('.page-forward') as Element);
  expect(forward).toHaveBeenCalled();
});

it('clicking reload keeps the iframe pointed at the same URL', () => {
  const { container } = render(<PageTab page={makePage({ url: 'https://slashdot.org/' })} closeTab={vi.fn()} index={0} client={makeClient()} />);
  fireEvent.click(container.querySelector('.page-reload') as Element);
  expect(container.querySelector('iframe')?.src).toBe('https://slashdot.org/');
});
```

Run `./scripts/run.mjs check-diff` after implementing.

## Spec updates

- `product/specs/embedded-web-page.md` — in the intro paragraph ("Page viewing is intentionally minimal..."), add a short clause noting that the metadata row carries left-floated back/forward/reload controls that navigate the embedded page's history or reload it, without reading or scripting its contents — distinguishing navigation control (now supported) from content access (still never done, aside from the existing monitor exception).

## Docs

- Checked `help.md` — no mention of the page tab's controls. No update needed there.
- `documentation/user-documentation/tab-types/web-pages.md`'s "Viewing, not driving" section states: "The app doesn't script, read, or control the embedded page — whatever you can do inside it, you do by hand." This directly describes behavior the fix changes (the app now offers navigation control). Update that sentence to carve out back/forward/reload as host-controlled navigation, while keeping the "doesn't script or read" guarantee intact — e.g.: "The app doesn't script or read the embedded page's contents — whatever you do inside it, you do by hand — but the metadata row's back, forward, and reload buttons do control its navigation history from the outside."

## Verification

- `./scripts/run.mjs check-diff`.
- Manual: open a page tab, navigate within the embedded site, click Back/Forward and confirm the embedded page's history moves; click Reload and confirm the page reloads. Not runnable in this environment — noting as unverified manually.

## Out of scope

- Disabling back/forward at history boundaries — cross-origin script cannot reliably read whether more history exists, so both buttons stay always-enabled and rely on the browser's own no-op behavior at the boundary (matching how a real browser's chrome behaves when there's nothing to go back/forward to).
- Any change to how the page's URL is tracked or displayed (see the separate "follow the actual url in view" backlog item) — unrelated to this fix.
