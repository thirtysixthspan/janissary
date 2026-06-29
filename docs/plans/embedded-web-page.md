# Embedded web pages via `open`

## Goal

Teach the existing `open` dispatcher to recognize **web addresses** and open them as an embedded,
in-app **page tab** (a passive viewer). There is no standalone `page` command — pages are opened
through `open`:

```
open https://slashdot.org     → embedded page tab "1) slashdot.org"  (recognized by scheme)
open page slashdot.org         → embedded page tab "2) slashdot.org"  (page keyword; defaults https)
open external https://x.com    → opens x.com in the OS default browser
close page 1                   → closes the page tab numbered 1
```

A page tab is a near-clone of the existing **image tab** (a `view` tab with no command bar,
in-memory only, with a × close), swapping `<img>` for `<iframe>`. Opening is a new **web opener**
in the `open` dispatcher, parallel to the image opener.

### Non-goals (unchanged from the simplified scope)
- No communication/control/reading of the embedded page (no postMessage bridge, no CDP/automation).
- No cross-origin/framing bypass. Sites that send `X-Frame-Options`/CSP `frame-ancestors` show a
  blank frame — accepted; we render what we can.
- No separate browser window.

---

## How it fits `open`

`open` is already a dispatcher that routes a target to an **opener** (`src/commands/open.ts`,
`src/openers/`, dispatch in `Controller.runOpen` `src/controller.ts:520-558`). Today openers are
keyed by file **extension** (`openerForExtension`, `src/openers/index.ts:12`). We add:

1. **Target classification** in the dispatcher: a target with an `http`/`https` scheme, or any
   target preceded by the new **`page`** keyword, is a *web address* → routed to the **web opener**.
   Otherwise it is a *file* → the existing extension flow (glob, existence, `openerForExtension`).
2. A **web opener** (`src/openers/page.ts`) with the same `inline`/`external` surface shape as the
   image opener, selected by URL recognition rather than by extension (so it is invoked directly by
   the dispatcher, not via the extension registry).

Mirror the image tab for everything downstream (the view tab itself):

| Concern | Image-tab reference |
|---|---|
| View tab kind / payload | `Tab.view`/`Tab.image` (`src/types.ts:66-93`) |
| Wire type | `TabView.view`/`TabView.image` (`src/protocol.ts:18-41`) |
| Tab factory | `makeImageTab` (`src/tab.ts:64-71`) |
| Create + focus | `openImageTab` (`src/controller.ts:592-602`) — group/color/placement, **no `persist`** |
| Unique label | `uniqueImageLabel` (`src/controller.ts:604-612`) |
| Serialization | `view()` carries view/title/image (`src/controller.ts:125-136`) |
| Render branch | `App.tsx:159-169` |
| Component | `web/src/ImageTab.tsx` |
| Tab-strip title + × | `web/src/TabStrip.tsx:22-33` |
| Close cleanup | `closeTab()` (`src/controller.ts:958-987`) |
| CSS | `.image-*` (`web/src/theme.css:44-51`) |

---

## ⚠️ Required: our own CSP

The server's CSP has **no `frame-src`** (`src/index.ts:12`), so it falls back to
`default-src 'self'` and blocks every external iframe — even compliant sites. Add `frame-src`:

```
…; img-src 'self'; frame-src https: http:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'
```

Keep `frame-ancestors 'none'` (`index.test.ts:64` still holds). This only lets compliant sites
load; sites that refuse framing remain blocked (accepted non-goal).

---

## Dispatch & opener changes

### `src/commands/open.ts` — `parseOpen`
Extend the parser to consume an optional `page` keyword (alongside `external`) and to surface the
classification. New result shape:

```ts
export type ParsedOpen = { external: boolean; web: boolean; target: string } | { error: string };
```
- Strip `open`; consume leading `external` and `page` keywords (each optional, order-independent).
- `target` = the remainder, verbatim (kept for paths with spaces); empty → `{ error: 'Usage: open [external] [page] <target>' }`.
- `web = pageKeyword || /^https?:\/\//i.test(target)`.
- `isGlobPattern` is unchanged and only consulted on the file branch.

### `src/openers/page.ts` (new) — web opener
Pure helpers + the opener surface. Not registered in the extension array; exported for the
dispatcher to invoke directly.

```ts
export function normalizeWebUrl(target: string): { url: string } | { error: string };
// http/https kept; bare (no scheme) → prepend https://; any other scheme → error; validate via new URL().
export function rootDomain(hostname: string): string;
// strip leading "www."; registrable-domain heuristic (last 2 labels; keep 3 when SLD ∈ co|com|org|net|gov|ac|edu and ≥3 labels).

export const webOpener = {
  name: 'page',
  inline: (target, context) => {
    const n = normalizeWebUrl(target);
    if ('error' in n) { context.note(`open: invalid URL "${target}"`); return; }
    context.openPageTab({ url: n.url, domain: rootDomain(new URL(n.url).hostname) });
  },
  external: (target, context) => {
    const n = normalizeWebUrl(target);
    if ('error' in n) { context.note(`open: invalid URL "${target}"`); return; }
    const domain = rootDomain(new URL(n.url).hostname);
    context.note(context.openExternally(n.url) ? `Opening ${domain} in your browser…` : `No browser available. The address is ${n.url}`);
  },
};
```

Test table for `normalizeWebUrl`/`rootDomain`: `www.website.com`→`https://www.website.com/`,
`website.com`; `http://example.com/x` kept, `example.com`; `docs.example.com`→`example.com`;
`foo.example.co.uk`→`example.co.uk`; `javascript:alert(1)`→error.

### `OpenContext` — `src/openers/types.ts`
Add one capability (external reuses the existing `openExternally`, which already accepts a URL via
`didOsOpen`, `src/openers/os-open.ts`):

```ts
openPageTab: (view: { url: string; domain: string }) => void;
```

### Dispatcher — `src/controller.ts` `runOpen`/`openOne`
After `parseOpen`, branch on `parsed.web` **before** the glob/existence/extension logic:

```ts
if (parsed.web) {
  const opener = webOpener;
  void (parsed.external ? opener.external(parsed.target, context) : opener.inline(parsed.target, context));
  return;
}
// …existing file flow (glob, resolve, existsSync, openerForExtension)…
```
Add `openPageTab` to the `context` object built in `runOpen` (`src/controller.ts:529-534`).

---

## View tab (mirror the image tab)

### Data model
- `src/types.ts`: widen `Tab.view` to `'agent' | 'image' | 'page'`; add `page?: PageView`; add
  `PageView = { url: string; domain: string; number: number }` next to `ImageView`.
- `src/protocol.ts`: add `page?: PageView` to `TabView`, widen `view`, re-export `PageView`.
- `src/tab.ts`: `makePageTab(label, dotColor, number, group, groupColor, page)` →
  `{ ...makeTab(...), view:'page', title: `${page.number}) ${page.domain}`, page }`.

### Controller
- `openPageTab({ url, domain })` — clone of `openImageTab` (`src/controller.ts:592-602`): assign
  `number = uniquePageNumber()`, build `PageView`, `makePageTab` with internal label
  `page-<number>`, same group/color/placement (`insertTabInGroup`, `distinctColor`), set active,
  `emitState`, **no `persist`**.
- `uniquePageNumber()` — smallest positive integer not used by an open page tab (tidy `1) 2) 3)`,
  reused after close).
- `view()` mapping: add `page: t.page` (`src/controller.ts:136`).
- `closeTab` needs **no** new branch: a page tab owns no shell/acp/browser/workspace and no served
  file, so the image-only file-unregister at `src/controller.ts:964` doesn't apply; the tab is just
  dropped.

### Closing
- Manual × (primary) and active-tab `close` already work for view tabs.
- `close page <n>`: broaden `close` matcher from `=== 'close'` (`src/commands/close.ts:7`) to
  `/^close\b/i`; add `parseClose(cmd)` → `{ target:'active' } | { target:'page'; number } | { error }`.
  Controller `case 'close'`: `active` → `closeTab(activeTab)`; `page n` → close the tab whose
  `page.number === n`, else `No page numbered <n>.`; bad form → `Usage: close [page <n>]`.
  `resolveCommand` matches `close` before `getOutput` (`src/resolve.ts:28-40`).

### Web client
- `web/src/PageTab.tsx` (new) — clone of `ImageTab.tsx`: a `.page-meta` header (`N) domain`, full
  url) + `<iframe className="page-frame" src={page.url} title=…>`. No token (loads the URL
  directly); no sandbox for best compatibility on a local user-chosen viewer (a
  `sandbox`/`referrerpolicy` can be added later as polish).
- `web/src/App.tsx`: add a `view === 'page'` render branch mirroring `:159-169`; import `PageTab`.
- `web/src/TabStrip.tsx`: widen the × condition (`:23`) to `view === 'image' || view === 'page'`
  (title already renders via `title ?? label`).
- `web/src/theme.css`: `.page-*` rules mirroring `.image-*`; `.page-frame { flex:1; width:100%;
  height:100%; border:0; background:#fff; }`. Run `npm run lint:css`.

---

## Help / docs
- README "### Commands" feeds `help` (`src/commands.ts:26-39`): update the `open` row to mention
  web pages (e.g. *"images/files in a tab, web pages embedded; `open external` uses the OS
  viewer/browser"*) and update `close` (*"…or `close page #`"*).

---

## Testing

| Area | File | Cases |
|---|---|---|
| Parse/classify | `src/commands/open.test.ts` | `page` keyword + `http(s)` URL set `web`; `external page`; bare path stays `web:false`; usage on empty |
| URL/domain | `src/openers/page.test.ts` (new) | `normalizeWebUrl`/`rootDomain` tables; scheme rejection |
| close parse | `src/commands/close.test.ts` | bare `close`; `close page 3`; bad form |
| Dispatch + tab | `src/controller.test.ts` (cf. image test `:505`) | `open https://slashdot.org` and `open page slashdot.org` → `view:'page'`, `title:'1) slashdot.org'`; 2nd → `2)`; `open external https://x` → browser note; `close page 1`; number reuse |
| CSP | `src/index.test.ts` (extends `:64`) | header has `frame-src` **and** `frame-ancestors 'none'` |
| Web | `web/src/test/` | `<PageTab>` renders `<iframe src=url>`; `<TabStrip>` shows `1) domain` + × on `view:'page'` |

Run `npm run check`. Keep web-opener logic factored vs. the image opener / `openImageTab` to
satisfy `jscpd`/`knip`.

---

## Out of scope / future
- Any interaction with the embedded page; rendering sites that refuse framing (would need
  CDP/header-stripping or a proxy).
- Navigation chrome / changing a tab's URL after open; PSL-accurate `rootDomain`; persisting page
  tabs across relaunch.

---

## Change checklist
- [ ] `src/types.ts` — `PageView`, widen `Tab.view`, add `Tab.page`
- [ ] `src/protocol.ts` — `TabView.page`, widen `view`, re-export `PageView`
- [ ] `src/tab.ts` — `makePageTab`
- [ ] `src/openers/types.ts` — `openPageTab` on `OpenContext`
- [ ] `src/openers/page.ts` (new) — `normalizeWebUrl`, `rootDomain`, `webOpener`
- [ ] `src/commands/open.ts` — `parseOpen` consumes `page`, returns `web`
- [ ] `src/controller.ts` — web branch in `runOpen`, `openPageTab`, `uniquePageNumber`, `view()` map
- [ ] `src/commands/close.ts` — broaden matcher, `parseClose`; controller `close page <n>` targeting
- [ ] `src/index.ts` — CSP `frame-src`
- [ ] `src/commands.ts` / README — `open` + `close` help rows
- [ ] `web/src/PageTab.tsx` (new), `App.tsx` branch, `TabStrip.tsx` ×, `theme.css`
- [ ] Tests per the table; `npm run check` green
