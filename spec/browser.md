# Browser

The `browser` command drives a real [Playwright](https://playwright.dev) Chromium browser so a tab (or its ACP agent) can fetch web content as a regular user — running JavaScript, navigating, capturing the viewport, and reading rendered text. The command parser lives in `src/browser-command.ts` (`parseBrowserCommand`), the Playwright lifecycle in `src/browser.ts`, and the orchestration in `src/cli.tsx` (`runBrowserInTab`). Playwright is installed as a dependency, driven through `playwright-extra` with `puppeteer-extra-plugin-stealth` for bot-detection resistance (see Bot-detection countermeasures); `postinstall` runs `npx playwright install chromium`.

### One process per tab

Each tab launches its **own** browser process the first time it is used (`launchTabBrowser`), held in `browserRef` keyed by tab index — the same per-tab model as `shellsRef`/`acpRef`, not the global model used by SQLite. Because processes are independent, one tab can run headless while another runs headed at the same time. Playwright primitives map as: **Browser** (one process per tab) → **BrowserContext** (one isolated "window") → **Page** (the viewport).

### Windows

A *window* is a `BrowserContext` plus a single `Page`, with its own cookies/sorage (isolation between windows). Windows are addressed by a per-tab counter id (`w1`, `w2`, …); each tab tracks a *current* window. `browser open` opens a new window and makes it current; `browser use <id>` switches; `browser list` lists them with the current one marked `*`. Page actions (`goto`, `eval`, `shot`, `content`) auto-launch the tab's browser (headless) and auto-open a window if the tab has none, so an agent can navigate without managing windows.

### Bot-detection countermeasures

The browser is configured to resemble an ordinary user's browser rather than headless automation. The measures span launch, the plugin layer, and per-window context options:

- **New headless mode.** `launchTabBrowser` launches with `channel: 'chromium'`, selecting Chromium's new headless implementation (a real browser run headless) rather than the legacy headless shell, which exposes obvious tells. The same code path serves headed mode (`headless: false`).
- **Automation flag disabled.** Launch args include `--disable-blink-features=AutomationControlled`, which suppresses the flag that sets `navigator.webdriver` and the automation banner.
- **Stealth plugin.** Chromium is driven through `playwright-extra` with `puppeteer-extra-plugin-stealth` (registered once at module load via `chromium.use(StealthPlugin())`). The plugin patches the common headless tells: `navigator.webdriver`, a missing `window.chrome`, and permissions/plugins/WebGL/`userAgentData` inconsistencies. As belt-and-suspenders, each context also adds an init script forcing `navigator.webdriver` to `false`.
- **Coherent per-window fingerprint.** Each window's `BrowserContext` is created from a `randomBrowserProfile` (`src/user-agent.ts`): a randomized desktop Chrome user agent (platform token varied across Windows / macOS / Linux; the Chrome major version pinned to the **real engine version** read from `browser.version()` so the UA matches the engine-emitted client hints) together with a matching `Sec-CH-UA-Platform` header, an `Accept-Language` header consistent with the chosen `locale`, a platform-plausible `timezoneId`, and a common desktop `viewport`. The point is twofold: isolated windows never share an identical signature, and no exposed field contradicts another (a UA disagreeing with the platform/locale/timezone/client hints is itself a tell).

`randomBrowserProfile`, `randomUserAgent`, and `acceptLanguage` take an injectable `rand` / accept explicit inputs for deterministic testing; `DEFAULT_CHROME_MAJOR` is the fallback version when the real one can't be read.

### Headless vs. headed

The mode is **headless by default**. `browser open --headed` (or `-H`) launches that tab's browser visible. The mode is fixed for the lifetime of the tab's process — `--headed` only takes effect on the call that first launches it; requesting `--headed` against an already-running headless browser returns a notice and the mode is unchanged. To switch modes, close all of the tab's windows (which ends the process) and `browser open` again. Headed mode needs a display; on a headless host the launch fails and the error is surfaced rather than crashing.

### Actions

- `goto <url>` — navigate the current window (waits for load), returning a `title — url` summary.
- `content` — the page's rendered text (title + `body.innerText`), truncated to ~10k chars (the truncation is flagged) so a large page does not overflow an agent prompt.
- `eval <js>` — evaluate JavaScript in the page and return the JSON-stringified result. This is an arbitrary-code surface in the page context; acceptable for a local dev tool.
- `shot` — screenshot the viewport to a PNG in a fresh OS temp directory and, on macOS, open it in Preview via a detached `open -a Preview` (never blocking the render loop); the path is printed. On non-macOS platforms only the path is printed.

Each `browser` command shows a `Running…` entry while the async action completes, then the entry is finalized with the result (mirroring shell/acp).

### Lifecycle and persistence

Closing a tab's last window ends that tab's browser process; `connection close browser:<id>` and `browser close`/`browser window close` share the same `closeBrowserWindow` path. Closing a tab, quitting, and component unmount close every tab's browser. Browser windows are **live and per-tab**, so — like shell/acp and unlike SQLite — they are **not** restored on `--relaunch`; nothing browser-related is written to agent state.

### `browser` command

`browser <open|list|use|goto|eval|shot|content|close|window close> …` drives a per-tab headless/headed web browser. See the Headless Browser section. Subcommands:

- `browser open [name] [--headed|-H]` — launch this tab's browser (if not running) and open a window; `--headed` requests a visible browser.
- `browser list` — list this tab's windows, marking the current one.
- `browser use <id>` — make a window current.
- `browser goto <url>` — navigate the current window (auto-opens a window if none).
- `browser content` — print the current page's rendered text (truncated).
- `browser eval <js>` — run JavaScript in the page and print the result.
- `browser shot` — screenshot the viewport to a temp PNG and open it in Preview (macOS).
- `browser close [id]` / `browser window close <id>` — close the current window, or a specific window by id (`browser close <id>` is an alias for `browser window close <id>`).

Malformed invocations return a `Usage:` message.
