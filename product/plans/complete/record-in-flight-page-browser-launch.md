# Record a tab's page-browser launch while it is in flight

Backlog: technical debt — "Record a tab's page-browser launch while it is still in flight, so concurrent first uses share one Chromium and a tab closed mid-launch releases the browser it asked for."

Complexity rating: 4/10

## Goal

The per-tab page browser was registered only after `await launchTabBrowser` resolved, in two places (`BrowserManager.run`'s `'open'` case and `ensureCurrentWindow`). An in-flight launch was invisible to other callers and to teardown: two overlapping first uses (the interactive command, an agent message, the ACP tool loop) each launched a Chromium and the first was overwritten and never closed, and a tab closed during a launch left a headless browser registered under a dead label that a reused label then inherited.

## Approach

`BrowserManager` records each launch in a `launching` map before awaiting it, and one private `entryFor(label, headless)` serves the `'open'` case and every window-using action (`goto`, `eval`, `content`, `shot`), so callers for one label share one launch. Each launch carries a release marker: `closeTab` and `closeAll` set it and drop the pending launch, and the launch, on settling, closes the browser it opened instead of registering it, failing its waiting callers with a browser error. `ensureCurrentWindow` and the `run*` helpers in `src/browser/tab-helpers.ts` now take the settled entry instead of the map, so the helper no longer launches anything itself.

## Tests

- `src/browser/tab.test.ts`: two concurrent `goto` calls on a fresh label launch once and both succeed; `closeTab` during a launch closes the browser when the launch completes and the pending call reports a browser error; `closeAll` releases an in-flight launch the same way.
- The existing open, goto, closeTab and closeAll cases keep passing.

## Out of scope

- A launch that never settles, which holds its label until the process exits.

## Specs and docs

- `product/specs/browser.md`: a tab never launches more than one browser; concurrent first uses share it; a tab closed mid-launch stops the browser once it is up.
- `help.md` and `documentation/user-documentation/`: do not describe launch concurrency; no edit.
