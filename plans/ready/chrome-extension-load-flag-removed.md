# Fix Chrome frame-enabler extension not loading (`--load-extension` removed in Chrome 137+)

**Complexity: 6/10** — a new CDP-connection subsystem with real ordering/failure-mode reasoning (Chrome launch → ephemeral debug port → CDP connect → extension load, any step of which can fail), one new module, and a soft-fail path — not a large surface, but the first CDP-driven mechanism in `main.ts`'s launch path.

## Goal

`open <url>` / `open page <url>` should render sites that refuse to be framed (via
`X-Frame-Options` or CSP `frame-ancestors`) by stripping those headers via the bundled
`chrome-extension/` (Janissary Frame Enabler), as already documented in
`specs/embedded-web-page.md`. Today this silently does not happen: the extension never loads into
the launched Chrome at all.

## Problem (verified this session, against a live Chrome 150.0.7871.115 on macOS)

`src/main.ts:100-108`'s `openApp()` launches the user's real system Chrome with:

```
--load-extension=<repo>/chrome-extension
--disable-extensions-except=<repo>/chrome-extension
```

Google removed the `--load-extension` command-line flag from **branded/stable Chrome builds
starting at Chrome 137** (2025), specifically because it was widely abused to silently side-load
malicious extensions. See:

- [PSA: Removing `--load-extension` flag in Chrome branded builds](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/1-g8EFx2BBY/m/S0ET5wPjCAAJ)
- [RFC: Removing the `--load-extension` flag in branded Chrome builds](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/aEHdhDZ-V0E/m/UWP4-k32AgAJ)
- [What's happening in Chrome Extensions, June 2025](https://developer.chrome.com/blog/extension-news-june-2025)

On the test machine's Chrome 150.0.7871.115, the flag is a silent no-op: the launched process
(confirmed via `ps`) has exactly the right command line, the extension's `manifest.json` /
`rules.json` / `content-script.js` are all present and valid (confirmed by reading each file and
`src/chrome-extension.test.ts`), and Developer Mode is on and persisted
(`extensions.ui.developer_mode: true` in the profile's `Default/Secure Preferences`) — but
`extensions.settings` in that same file only ever contains Chrome's five built-in component
extensions (PDF viewer, hangout services, web store, glic, speech synthesis). The Frame Enabler
never registers. The "Your browser is managed by your organization" banner Chrome shows on launch
is a side effect of passing an enterprise-associated flag, not a sign of an actual org policy
(verified: no MDM enrollment via `profiles status -type enrollment`, no
`/Library/Managed Preferences`, no `/Library/Google/Chrome/policies` on the test machine).

`plans/complete/recover-chrome-extension.md` (which restored the extension's deleted static files)
explicitly scoped out manual, real-Chrome verification ("not verifiable in this environment"), so
this break has likely gone unnoticed since Chrome 137 shipped — the extension may never have
actually worked since then, independent of that fix.

## Why `findSystemChrome()` can't just switch to Chrome for Testing

`src/main.ts:62-64`'s comment says it deliberately launches the user's real installed
Chrome/Chromium/Edge/Brave (`findSystemChrome()`, `src/main.ts:65-87`) rather than Playwright's
Chrome for Testing build, which `src/browser/index.ts:74-75` uses via `chromium.launch({ channel:
'chromium' })` for the separate headless/headed browser-automation feature. Chrome for Testing
still honors `--load-extension`, but it's flagged by many sites as automation (missing
codecs/DRM, automation fingerprint) — presumably why the app avoids it for the user-facing app
window. This plan keeps launching real branded Chrome; it does not touch `findSystemChrome()`.

## Design decisions

**Load the extension over CDP (`Extensions.loadUnpacked`) instead of a launch flag.** This is
Chrome's own sanctioned replacement for `--load-extension` (per the removal RFC: "working with the
community to update tools like Puppeteer"). Concretely:

1. Launch Chrome with `--remote-debugging-port=0` (ephemeral, OS-assigned) in addition to (see
   below) the existing flags, instead of relying on `--load-extension` alone.
2. Once the process is spawned, read the actual assigned port from
   `<profile>/DevToolsActivePort` — Chrome writes this file shortly after startup when given
   `--remote-debugging-port=0` (first line: the port number; second line: the browser target
   path). Poll for the file's existence with a short retry loop (it does not exist the instant the
   process is spawned).
3. Connect with Playwright's `chromium.connectOverCDP('http://127.0.0.1:<port>')` (already a
   project dependency — see reuse table below) to get a `Browser` handle, then call
   `browser.newBrowserCDPSession()` to get a browser-scoped `CDPSession` (this is the same session
   type used for browser-level, non-page-scoped commands).
4. Send `Extensions.loadUnpacked` with `{ path: extDir }` on that session. Playwright's TypeScript
   protocol types don't include the `Extensions` domain (it's newer than the bundled types), so
   this call needs an explicit cast at the `session.send(...)` call site — that's expected, not a
   sign of doing it wrong.
5. Close the CDP connection (`browser.close()` on the *connected* handle only disconnects,
   it does not stop the launched process, since this was `connectOverCDP` onto an
   externally-spawned process, not a Playwright-owned launch) once the load call resolves or
   fails.

**Ephemeral port, not a fixed one.** `src/index.ts:38,122-126` already establishes the codebase's
convention for this: `options.port ?? 0` passed to `http.listen`, documented as intentional in
`plans/complete/multiple-instances.md` decision 3 ("Port allocation: already automatic"). The app
already supports multiple concurrent instances (`src/instance-lock.ts`, one lock per project
directory), each with its own `.janissary/chrome` profile dir — but the OS-level debug port
namespace is shared across all Chrome processes on the machine regardless of profile, so a fixed
port would collide across concurrent instances. Use `--remote-debugging-port=0` for the same
reason `startServer` uses `port ?? 0`.

**Keep the existing `--load-extension` / `--disable-extensions-except` flags too.** They are a
no-op on branded Chrome 137+ but still work on non-branded Chromium (one of `findSystemChrome()`'s
candidates) and on any pre-137 Chrome a user might have — harmless when ignored, and one less
thing that regresses if the CDP path fails for an unrelated reason on an older browser where the
flag still works. Do not remove them.

**Soft-fail on any step of the CDP load.** Port-file read timeout, CDP connect failure, or
`Extensions.loadUnpacked` erroring (e.g. an even-newer Chrome that also drops CDP-based unpacked
loading, or an ancient Chrome with no `Extensions` domain at all) must never block app startup —
page-tab framing is a nice-to-have, not core functionality. On failure, write one line to stderr
using the exact existing convention at `src/config.ts:46`
(`process.stderr.write('warning: ...\n')`), e.g. `warning: Chrome frame-enabler extension failed
to load (<reason>) — sites that block iframing may not render in page tabs`. Do not retry.

**New module `src/chrome-extension-loader.ts`.** `src/main.ts` is currently 174 lines against the
200-line `max-lines` budget (`CLAUDE.md`); the port-file read/poll, CDP connect, and
`Extensions.loadUnpacked` call do not fit in `openApp()` without exceeding it (this is the same
budget pressure `plans/complete/actionable-startup-errors.md` hit and solved the same way, by
extracting `src/startup-errors.ts`). `openApp()` calls this module's export after spawning Chrome;
the module owns the port-file poll, the CDP connect/session/send, the cast for the untyped
`Extensions` domain, and the stderr warning formatting. It does not own process spawning — that
stays in `openApp()`.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Chrome spawn + existing `--load-extension`/`--disable-extensions-except` flags | `src/main.ts:94-112` (`openApp`) |
| `findSystemChrome()` | `src/main.ts:65-87` — unchanged by this plan |
| Playwright dependency, CDP-capable (`chromium.connectOverCDP`, `browser.newBrowserCDPSession`) | `node_modules/playwright-core` (already used by `src/browser/index.ts:5-6,74-75`); confirmed present in `playwright-core/types/types.d.ts`. Only used here as a CDP client onto the already-spawned Chrome process — never calls `chromium.launch()`, so it needs none of Playwright's bundled browser binary (the `postinstall: npx playwright install chromium` step exists for `src/browser/index.ts`'s unrelated `chromium.launch()` calls, not for this) |
| Ephemeral-port convention (`port ?? 0`) | `src/index.ts:38,122-126`; rationale documented in `plans/complete/multiple-instances.md` decision 3 |
| stderr warning convention for non-fatal failures | `src/config.ts:46` |
| Extension's own files (unchanged) | `chrome-extension/manifest.json`, `chrome-extension/rules.json`, `chrome-extension/content-script.js` |
| `src/chrome-extension.test.ts` (existing, unchanged) — validates the extension's static files, unrelated to loading them |

## Implementation

1. **`src/chrome-extension-loader.ts`** (new): exports one async function, e.g.
   `loadFrameEnablerExtension(profileDir: string, extDir: string): Promise<void>`, that:
   - Polls for `<profileDir>/DevToolsActivePort` (short interval, bounded total wait — pick a
     ceiling generous enough for a cold Chrome start, e.g. a few seconds, not indefinite).
   - Reads the port from the file's first line.
   - Connects via `chromium.connectOverCDP`, opens a browser CDP session, sends
     `Extensions.loadUnpacked` with `{ path: extDir }`.
   - Disconnects the CDP handle when done.
   - Catches any failure at any step and writes the single stderr warning line (per the Design
     decisions section above) instead of throwing — this function must never reject in a way that
     stops `openApp()`.
2. **`src/main.ts`**: add `--remote-debugging-port=0` to the `spawn()` args at `src/main.ts:100-108`
   (alongside, not replacing, the existing `--load-extension`/`--disable-extensions-except` flags).
   After the spawn call, invoke `loadFrameEnablerExtension(profile, extDir)` — since `openApp()` is
   currently synchronous (`void`-returning) and detaches the child process, call it without
   awaiting from `openApp()` (fire-and-forget, consistent with the function's existing
   fire-and-forget spawn pattern), letting the loader's own internal poll/retry handle the timing
   of "Chrome isn't ready yet."

## Tests

- `src/chrome-extension-loader.test.ts` (new): test the parts that don't require a real Chrome
  process — the `DevToolsActivePort` file parsing (given file contents, extract the correct port
  number) and the timeout/give-up path (file never appears within the poll ceiling → the stderr
  warning fires, via a `process.stderr.write` spy, matching the spy pattern in
  `plans/complete/actionable-startup-errors.md`'s `src/config.test.ts` extension). Do not attempt
  to spin up a real Chrome + CDP connection in this test — `src/main.ts` itself has no test file
  for the same reason (it spawns real processes; noted in `plans/complete/recover-chrome-extension.md`).
- Manual verification (required — this is the only way to confirm the actual fix): launch the app,
  open a second Chrome window on the same profile (`--user-data-dir=<projectDir>/.janissary/chrome
  chrome://extensions`) and confirm "Janissary Frame Enabler" is listed and enabled; then open a
  page tab to a site that normally refuses framing (e.g. `https://github.com`) and confirm it
  renders instead of refusing.

Run `./scripts/run.mjs check-diff` after the change.

## Out of scope

- Any change to the extension's own files (`manifest.json`, `rules.json`, `content-script.js`) —
  these are already correct and unaffected by this bug.
- Any change to `specs/embedded-web-page.md` — behavior description remains accurate once fixed.
- Any change to `findSystemChrome()` or the decision to avoid Chrome for Testing.
- Windows/Linux-specific verification — this session's diagnosis was macOS-only. The root cause
  (branded Chrome 137+ dropping `--load-extension`) is cross-platform, and `DevToolsActivePort` is
  written the same way on all platforms, but the manual verification step above should be repeated
  on Windows and Linux before considering this shipped everywhere.
- Removing the now-redundant `--load-extension`/`--disable-extensions-except` flags — kept
  deliberately (see Design decisions).
