# Embedded page tab — render sites that refuse framing

Follow-up to the shipped embedded web page feature (`docs/plans/complete/embedded-web-page.md`,
`spec/embedded-web-page.md`). That feature renders only sites that permit being framed; this plan
makes sites that **refuse** framing render too.

## Problem

`open <url>` / `open page <url>` shows a site in an in-app `<iframe>`. Two layers gate framing:

- **Embedder side (us):** our server CSP must allow framing external origins — `frame-src https:
  http:` (already added in the base feature; `src/index.ts:12`).
- **Embeddee side (the site):** the site can refuse with `X-Frame-Options: DENY/SAMEORIGIN` or
  CSP `frame-ancestors 'self'`. The browser enforces these from the **site's own response
  headers**, so the embedder cannot override them from page markup. The only way to render such a
  site in an iframe is to **remove those headers before the browser acts on them**.

## Options

| Approach | How | Verdict |
|---|---|---|
| **Header-strip extension** | A bundled Chrome extension uses `declarativeNetRequest` to drop `X-Frame-Options` / CSP `frame-ancestors` on sub-frame responses | **Recommended** — iframe still loads from the real origin (session/cookies intact); no proxy; contained to the app's Chrome |
| Reverse proxy | Server fetches the page and re-serves it from our origin with headers stripped | Rejected — URL/asset rewriting, breaks SPAs and logged-in sites, SSRF surface |
| App under CDP | Launch the app in a Playwright/CDP browser and strip headers via `Fetch` interception | Rejected here — changes the whole app launch model for one viewer feature |

The extension keeps the simple in-app iframe model and is the smallest change that loads the real
site with the user's session.

## Approach — bundled `declarativeNetRequest` extension

### `chrome-extension/` (new, shipped with the package)
- **`manifest.json`** (MV3): `"permissions": ["declarativeNetRequest"]`,
  `"host_permissions": ["<all_urls>"]`, and a static rule set via `"declarative_net_request": {
  "rule_resources": [{ "id": "framing", "enabled": true, "path": "rules.json" }] }`.
- **`rules.json`**: one rule —
  - `"condition": { "resourceTypes": ["sub_frame"] }` — apply **only to framed documents**, so the
    main app document's own CSP (the `frame-src` header we set) is never touched.
  - `"action": { "type": "modifyHeaders", "responseHeaders": [
       { "header": "x-frame-options", "operation": "remove" },
       { "header": "content-security-policy", "operation": "remove" } ] }`.
    (Removing the whole CSP on the framed response is simplest; alternatively `set` it to a value
    without `frame-ancestors` to preserve the site's other directives.)

### Launch — `src/main.ts`
- In `openApp` (`src/main.ts:76-91`) add `--load-extension=<dir>` and
  `--disable-extensions-except=<dir>`, where `<dir>` is the bundled extension directory resolved by
  absolute path (mirror how `webDir` is resolved from `import.meta.dirname` in `boot`,
  `src/main.ts:108`). The app already launches its own Chrome with a dedicated `.janissary/chrome`
  profile, so the extension is scoped to the app instance.
- Ensure the `chrome-extension/` directory is included in the published package (it is not built by
  `tsc`/Vite — add it to `package.json` `files`, and copy it into `dist` if the build relocates
  runtime assets).

## Effect & caveats

- The iframe still loads **directly from the real origin** — the user's existing login/session/
  cookies apply; only the framing refusal is removed. No new ability to read or script the page
  (still cross-origin): the page tab stays a **passive viewer**.
- **Managed-Chrome only.** When the app falls back to the OS default browser (no system Chrome
  found, `openUrl` path) or runs under `dev:web` (Vite in a normal browser), the extension is absent
  and such sites won't render. Acceptable; documented.
- This deliberately strips a site's security headers for the user's own chosen pages, locally — a
  reasonable trade for a personal viewer. Re-run `npm run security` after implementing.
- `--load-extension` can surface Chrome's "developer mode extension" notice; packing the extension
  avoids it.

## Testing
- Manual: `open https://<a site that sends frame-ancestors 'self'>` renders in a page tab when run
  via the launched app (e.g. a site like GitHub). Same URL in `dev:web` does **not** render
  (extension absent) — confirms scoping.
- Unit: assert `openApp` includes `--load-extension`/`--disable-extensions-except` with the resolved
  extension path (cf. existing `main`/launch tests, if any), and that the bundled `manifest.json` /
  `rules.json` target `sub_frame` and remove the two headers.
- `npm run check` green.

## Spec
- Update **What renders** in `spec/embedded-web-page.md` (done with this plan): in the app's managed
  browser, framing headers on embedded pages are removed so sites that refuse framing render; the
  page still loads from its real origin and is only viewed, not read/scripted.

## Checklist
- [ ] `chrome-extension/manifest.json` + `rules.json` — `declarativeNetRequest`, strip
      `X-Frame-Options` / CSP `frame-ancestors` on `sub_frame`
- [ ] `src/main.ts` — `--load-extension` / `--disable-extensions-except` pointing at the bundled dir
- [ ] `package.json` `files` (and build copy) — ship `chrome-extension/`
- [ ] `spec/embedded-web-page.md` — update **What renders**
- [ ] Tests; `npm run check` green
