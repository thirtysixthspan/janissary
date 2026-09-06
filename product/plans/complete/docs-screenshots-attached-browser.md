# Capture documentation screenshots with the workspace's attached browser

**Complexity: 4/10** — one new script module, one call site replaced in the capture entry point, a test file plus the two small config lines that make `scripts/` testable at all, one developer-doc correction, one new spec, and the regenerated PNGs. No application source changes, no wire-protocol change, and nothing a user of the app can observe.

`scripts/docs-screenshots.mjs` calls `chromium.launch()` from the project's own Playwright. Inside a sandboxed janissary workspace that can never work: Playwright keeps its Chromium under `$HOME`, the sandbox denies reading it, and the script's own guard turns that into `Playwright Chromium is not installed — run npm run playwright:install-chromium first.` The script says as much in its header comment ("Host-only"), `documentation/developer-documentation/documentation.md` repeats it, and `ai/tasks/update-documentation.md` tells an agent to ship a page without its screenshot when it hits that message.

A harness tab launched with `-b` already has a browser, though. Janissary starts a confined `chromium.launchServer()` child and hands the tab `JANISSARY_BROWSER_WS_ENDPOINT` (the guarded websocket endpoint) and `JANISSARY_PLAYWRIGHT` (the path to janissary's own Playwright client, so client and server versions match). It is headless, it runs on the same host as anything the capture starts, and `127.0.0.1` resolves between them — everything the capture needs. The only reason the pipeline cannot use it is that nothing has ever asked it to.

## Goal

`./scripts/run.mjs docs-screenshots` drives the attached browser inside a sandboxed workspace whose tab has one, so the committed PNGs under `documentation/public/screenshots/` can be regenerated from there. On a host with no attached browser the script behaves exactly as it does today. (See "What shipped, and what did not" below: the regeneration itself was blocked by the browser dying mid-run.)

## Design decisions

**Where the browser comes from is its own module.** `scripts/docs-screenshots/browser.mjs` answers one question — which browser this run drives — and hands back a handle. The entry point keeps its existing shape (`openBrowser()` in place of `chromium.launch()`), and the two acquisition paths stay side by side in one small file instead of spreading conditionals through the run loop.

**Both variables or neither.** The attached path is taken only when `JANISSARY_BROWSER_WS_ENDPOINT` and `JANISSARY_PLAYWRIGHT` are both non-empty. An endpoint without a client path is unusable (the project's own Playwright is a different build and will refuse the connection), so a half-set environment falls back to launching rather than failing on a version mismatch that reads like a network error.

**The attached browser is released, never closed.** `browser.close()` on a connection to `chromium.launchServer()` closes the *remote* browser, which fires the server's close handler in `src/browser/e2e-child.ts` and takes the tab's browser down permanently — every later connect gets `ECONNREFUSED` on an endpoint the tab still advertises. So the attached path's release is a no-op: the per-shot contexts are already closed by `capture.mjs`, and the connection drops when the script's process exits. The launched path keeps `browser.close()`, which is correct there because we own that browser. This is the reason the handle exposes `release()` rather than the raw browser — the caller must not be the one deciding.

**One retry on the first connect.** Janissary hands out the endpoint before Chromium has finished starting, deliberately, so nothing about the tab waits on the browser. A capture run that connects immediately can lose that race exactly once. A second attempt a second later is enough; a failure that survives it is a real failure and is reported as one.

**`chromium.executablePath()` is checked only on the launched path.** The check is what produces today's "not installed" message. On the attached path there is no local Chromium involved and the check would fail a run that is about to work.

**Reuse `createRequire`, not `import()`, for the attached client.** The package is CommonJS, and `(await import(path)).default` trips `unicorn/no-await-expression-member`. `createRequire(import.meta.url)(path)` reads plainly and lints clean.

**Make `scripts/` testable rather than leave the change unverified.** No vitest project includes `scripts/` today, so a test there would never run. The `server` project's `include` gains `scripts/**/*.test.mjs` and `check-diff.mjs` gains a `scripts/` trigger for the server tests — two lines, no new project, no new npm script, and `npm test`, `npm run check`, and CI all pick the file up without further wiring.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The shot manifest and per-shot capture logic | `scripts/docs-screenshots/manifest.mjs`, `capture.mjs` |
| Per-shot scratch directory, fixture git repo, fixture page server | `scripts/docs-screenshots/scratch.mjs` |
| App spawn and the `__JANUS_URL__` handshake | `scripts/docs-screenshots/janus.mjs` |
| The two environment variables and their contract | `ai/guidelines/sandbox-e2e-browser.md`, `src/browser/e2e-server.ts` |
| Contexts closed per shot (so nothing leaks into the tab's browser) | `capture.mjs`'s `finally { await context.close() }` |

## Implementation steps

1. **New module `scripts/docs-screenshots/browser.mjs`.** Export `attachedBrowserFromEnv(env)` returning `{ endpoint, clientPath }` or `undefined`; `connectAttached(chromium, endpoint, options)` implementing the single retry (with the delay and sleep injectable so a test does not wait a real second); and `openBrowser(env)` returning `{ browser, release, source }` — the attached path via `createRequire`, the launched path via `playwright` with the `executablePath()` guard preserved verbatim.

2. **`scripts/docs-screenshots.mjs`: use the module.** Drop the `playwright` import and the top-level `executablePath()` check, call `openBrowser()` where `chromium.launch()` was, log which browser the run is driving, and call `release()` in the existing `finally`. Update the file's header comment, which currently states the host-only constraint the change removes.

   Acquisition failure goes through the script's own `fail()` as `No browser to drive: <reason>`, closing the page server on the way out. Added after the fact, from hitting it: a dead attached browser rejects at the top level, and an uncaught rejection prints a stack trace through `openBrowser` where a sentence naming the refused endpoint is the whole diagnosis. A host with no Chromium reaches the same path, so the message the old top-level guard produced is not lost — it is what `<reason>` carries there.

3. **`vitest.config.ts`: add `scripts/**/*.test.mjs` to the `server` project's `include`.**

4. **`scripts/check-diff.mjs`: run the server tests when a `scripts/` file changed**, alongside the existing `src/` trigger.

## Tests

`scripts/docs-screenshots/browser.test.mjs` — new file, matching the style of the server tests (vitest `describe`/`it`/`expect`, no helper framework):

- `attachedBrowserFromEnv` returns the endpoint and client path when both variables are set.
- It returns `undefined` when either variable is missing, and when either is the empty string.
- `connectAttached` returns the browser from a connector that succeeds on the first call, without sleeping.
- `connectAttached` retries once when the first call rejects, and returns the second call's browser.
- `connectAttached` rejects with the second error when both calls fail, and does not attempt a third.

The end-to-end verification is the capture run itself: `./scripts/run.mjs docs-screenshots` regenerating every manifest shot from inside this workspace is the only thing that can prove the attached path drives the real app, and its PNGs are this change's deliverable.

## What shipped, and what did not

The module, its tests, the entry point, the config lines, the spec, and the two doc corrections all shipped. **The PNGs did not.** The tab's attached browser died part-way through the work, before the first capture ran, and nothing restarts one — every connect after that returned `connect ECONNREFUSED` on the endpoint the tab was still advertising, and the browser cannot be reattached to a running sandbox. So the regeneration this plan exists to enable has not happened yet; the next run in a tab with a live browser is what produces it.

The attached path is not unverified, though. Before the browser died, a connect through `JANISSARY_BROWSER_WS_ENDPOINT` using the client at `JANISSARY_PLAYWRIGHT` opened a context at the capture pipeline's own viewport and scale, navigated to a local `127.0.0.1` server the way a shot navigates to the app, and wrote a PNG. What is unproven is only the full manifest run: whether all twenty-seven shots behave the same against this browser as against a launched one.

## Out of scope

- **The `browser.close()` entry in `product/backlog/issues.md`.** That item's remedy is a bullet in `ai/guidelines/sandbox-e2e-browser.md`, or a browser that survives a client disconnect. This plan only avoids the trap in one script; it does not document or fix it generally, and it does not touch that guideline or that backlog entry.
- **`demo.png`.** The homepage hero is not a manifest shot and is not regenerated.
- **New or changed manifest entries.** Every shot is captured exactly as it is declared today; this change alters where the browser comes from, not what is photographed.
- **A vitest project of its own for `scripts/`,** or adding `scripts` to `npm test`'s project list. The two-line `include`/trigger addition covers this file; a project is worth adding when there is a body of script tests to justify it.
- **Making the capture deterministic.** Shots that photograph `ls -la` output carry the fixtures' current sizes and dates and will differ on every run. That is how the pipeline already behaves.
