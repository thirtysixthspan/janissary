# Record a tab's page-browser launch while it is in flight

Backlog: technical debt — "Record a tab's page-browser launch while it is still in flight, so concurrent first uses share one Chromium and a tab closed mid-launch releases the browser it asked for."

Complexity rating: 6/10 — a two-state record for the per-label browser map plus the release path that can see a launch in progress. Contained to two small modules in `src/browser/`, with no architecture change, but three orderings have to be reasoned about correctly: two first uses racing, a close landing mid-launch, and a launch that fails.

## Goal

A tab owns one Chromium process from the moment it first asks for one, not from the moment that
Chromium finishes starting.

Today the per-label record is written only after `await launchTabBrowser(...)` resolves, in two
places that each do it for themselves — the `'open'` case in `BrowserManager.run`
(`src/browser/tab.ts`) and `ensureCurrentWindow` in `src/browser/tab-helpers.ts`. While the launch
is in flight the label holds nothing, so:

- Two overlapping first uses each launch a Chromium; the second `browsers.set` overwrites the first and the first process is never closed. The interactive `browser` command, the agent-message `capture` hook in `src/commands/browser.ts` and the ACP tool table in `src/acp/tool-table.ts` can all reach this.
- `closeTab` (every closed tab, from `closeTabResources` in `src/tab/cleanup.ts`) and `closeAll` (quit and unmount) see no record, so a launch that lands afterwards leaves a headless browser running under a label nobody owns — and a reused label inherits it.

`product/specs/browser.md` already says "Each tab launches its **own** browser process the first
time it is used" and "Closing a tab, quitting, and component unmount close every tab's browser".
Both hold only when nothing overlaps.

## Approach

The map's value becomes a two-state record instead of always-live, discriminated by `state`, and
one function owns the transition:

- `tab-helpers.ts` gains `LiveEntry` (today's `Entry`), the `Entry` union, `liveEntry()` to narrow it, `entryFor(browsers, label, headless)` which puts a `launching` record in the map *before* awaiting `launchTabBrowser`, and `releaseEntry(entry)` which closes a live browser now or the one an in-flight launch is about to produce.
- `entryFor` hands every caller the same `LiveEntry` object — the promise resolves to it once — so the window counter stays shared between concurrent first uses. When the launch lands it replaces its own record, identified by identity, so a record a close already dropped is not written back; when it rejects it deletes its own record, so a failed launch does not leave the label holding a browser that will never arrive.
- `ensureCurrentWindow` loses its launch block and just awaits `entryFor(browsers, label, true)`.
- `tab.ts` routes the `'open'` case through `entryFor` too, narrows in `info`, `use` and `close`, and has `closeTab`/`closeAll` drop the record first and then `releaseEntry` it.

`entryFor` is a free function beside `ensureCurrentWindow` rather than the `BrowserManager` method
the backlog proposed. `tab-helpers.ts` already owns this map's mutation — `ensureCurrentWindow`
launches into it and `closeBrowserWindow` deletes from it — so the launch belongs here; a manager
method would have to be threaded through `ensureCurrentWindow` and its four callers, and each of
them only wants "give me this label's entry".

## Implementation steps

1. `src/browser/tab-helpers.ts`: the `Entry` union, `LiveEntry`, `liveEntry`, `entryFor`, `releaseEntry`; `ensureCurrentWindow` awaits `entryFor`; `closeBrowserWindow` and `formatList` narrow.
2. `src/browser/tab.ts`: import the new helpers, narrow in `info`/`use`/`close`, route `'open'` through `entryFor`, and make `closeTab`/`closeAll` drop the record and release it.
3. `./scripts/run.mjs check-diff` after each step.

## Tests

`src/browser/tab.test.ts` gains four cases; the existing open, `goto`, `closeTab`, `closeAll` and
error cases must keep passing unchanged.

- Two concurrent `goto` calls on a fresh label launch exactly one browser.
- `closeTab` during a launch closes the browser once the launch lands, and the label is left empty.
- `closeAll` during a launch closes that browser too.
- A launch that rejects leaves no record behind, so a later `open` on the same label launches again.

The two mid-launch cases drive a launch promise they resolve by hand, so the ordering is the test's
rather than the event loop's.

## Out of scope

- The window-level race inside `ensureCurrentWindow`: two callers that resume from the same launch
  can each find no current window and open one. Sharing the launch removes the second process; the
  second window is a separate question and would need its own record.
- An in-flight `open` whose tab is closed mid-launch reports `Browser error:` when the window call
  hits a browser being closed. That is the honest outcome for a tab that no longer exists; the
  change makes it possible where before it silently succeeded and leaked.
- The `browserRef` naming in `product/specs/browser.md`, which predates the `BrowserManager` map.

## Specs and docs

- `product/specs/browser.md`: the "One process per tab" section says overlapping first uses share
  the one process, and that closing a tab whose browser is still starting still closes it.
- `help.md` and `documentation/user-documentation/command-bar/browser.md`: already describe one
  browser per tab closed with the tab; no edit.
