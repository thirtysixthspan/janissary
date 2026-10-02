# Play a replay at its original size

**Complexity: 3/10** — a deletion of one function and one observer, one stylesheet overflow change, one new test file, and three prose edits; the number comes from there being no behavior to design, only a fit-to-pane rule to remove and a clipping rule to state in its place.

The replay tab renders a recording's recorded grid — the columns and rows the session ran in — and then shrinks the font until that grid fits whatever pane the tab happens to be in. So the same recording looks different in a wide centre tab and a narrow sidebar, the text gets small enough on a narrow one to be hard to read, and a viewer who wants to read a 120-column recording is looking at a picture of it rather than at it. Nothing is scaled. The recording's grid is rendered at the app's own terminal font size, and whatever does not fit the tab viewport is clipped — no scrollbars, because the tab is not a document and the transport already owns the timeline. A viewer who wants the whole recording resizes their window.

## Design decisions

**The font is the app's terminal font, read the same way `useXterm` reads it.** `--terminal-font-size` on the document root is the value every other terminal in the app renders at, and `useReplayTerminal` was carrying its own `BASE_FONT_SIZE = 13.5` alongside a scale factor. Both go; the replay reads the custom property and falls back to 13.5 when it is absent, so a replay in a replay-sized pane is the same text size as the terminal next to it. This is a substitution rather than a scale, which is what "do not scale the fonts" asks for.

**Nothing observes the container.** The `ResizeObserver` existed only to recompute the scale, so it goes with it. That also removes a `container.querySelector('.xterm-screen')` and a `clientWidth`/`offsetWidth` measurement on every pane resize, which the entry's second complaint is really about: the tab was doing layout work to stay fitted rather than playing the recording.

**Overflow is hidden in two places, not one.** `.replay-stage` carries `overflow: auto` today, and xterm's own stylesheet gives `.xterm .xterm-viewport` `overflow-y: scroll` — unconditionally, on every terminal xterm renders. Making the stage `hidden` alone would still leave a scrollbar inside the terminal on any platform that gives one width, so the replay's stylesheet overrides the viewport to `hidden` as well. A hidden-overflow element is still scrollable programmatically, which is what keeps xterm's cursor-follow working as the buffer scrolls during playback.

**The recorded grid is still authoritative, and a recorded resize still applies.** Only the font changes are removed. The terminal is still built at the recording's own columns and rows, and each recorded resize is still applied at its own timestamp, so what is on screen is what was on screen.

## What already exists (reuse, don't rebuild)

| Piece | Where |
| --- | --- |
| The app's own terminal font size, read once at mount | `web/src/shared/terminal/useXterm.ts:47` |
| The recorded colours and the fallback to the app theme's | `web/src/shared/terminal/colors.ts`, used by `useReplayTerminal` |
| The recorded grid as the terminal's constructor options | `web/src/plugins/replay/useReplayTerminal.ts` |
| xterm's always-on viewport scrollbar being overridden | `node_modules/@xterm/xterm/css/xterm.css` (`.xterm .xterm-viewport { overflow-y: scroll }`) |
| The test pattern for a hook that builds a real xterm | `web/src/harness/HarnessTab.test.tsx` (the `vi.mock('@xterm/xterm')` fake that captures constructor options) |

## Proposed changes

### The client

`web/src/plugins/replay/useReplayTerminal.ts` loses `refit`, the `ResizeObserver`, and `MIN_FONT_SIZE`; `BASE_FONT_SIZE` becomes the fallback for a font size read from `--terminal-font-size`. Its header comment stops describing a scaled font and says the recorded grid renders at the app's own terminal size.

`web/src/plugins/replay/replay.css` changes `.replay-stage` to `overflow: hidden`, adds `.replay-stage .xterm-viewport { overflow-y: hidden; }`, and has its leading comment say the stage clips rather than scrolls.

### Tests

A new `web/src/plugins/replay/useReplayTerminal.test.ts`, beside the hook rather than inside `ReplayTab.test.tsx` (which stubs the hook out and so cannot see any of this). It fakes `@xterm/xterm` the way `HarnessTab.test.tsx` does and pins three things: the terminal is constructed at the recording's own columns and rows; its font size is the app's `--terminal-font-size` rather than a scaled one, with the 13.5 fallback when the property is absent; and nothing resizes it afterwards — no `ResizeObserver` is registered, so a container resize leaves the font size alone. The recorded-colours and app-theme-fallback cases ride along, since the hook is the only place they are resolved.

### Documentation and specs

`product/specs/harness-recording.md` § Retrieval: the first bullet drops the scaled font and says the grid is rendered at the app's own terminal size, with whatever falls outside the tab clipped rather than scrolled.

`documentation/user-documentation/tab-types/recording-player.md`: "with the font scaled to fit the pane" becomes the app's own terminal size, and the page says a recording larger than the tab is clipped and that resizing the window is how to see all of it.

`documentation/user-documentation/advanced-agents/harness.md` needs no change: its replay section already says "at the size it was recorded at" and never mentions scaling.

`help.md` needs no change: neither replay row describes the terminal's sizing.

## Tests

Client, colocated:

- `web/src/plugins/replay/useReplayTerminal.test.ts` — new. The terminal is built at the recording's `cols` and `rows`; the font size is the document's `--terminal-font-size`; it falls back to 13.5 when that property is unset; a recorded `fg`/`bg` themes the terminal and their absence falls back to the app theme; and no `ResizeObserver` is constructed, so nothing scales the font after the first render.
- `web/src/plugins/replay/ReplayTab.test.tsx` needs no change: it stubs `useReplayTerminal` and already asserts the tab asks for nothing until the header arrives and for the recorded grid once it does.

## Out of scope

- Changing the recorded grid itself, the fit addon the hook never had, or the handling of a recorded resize.
- A zoom or "fit" control, which would reintroduce the scaling the entry removes.
- Scrolling within the replay tab, which the entry removes explicitly in favour of resizing the window.
- The pull request's description, which describes the scaled font in its What, Behavior examples, How to verify, and Files changed sections. `update-pull-request.md` owns it at merge time; this entry names no description change.
- `product/plans/complete/in-app-recording-replay.md`, which records the original scaled-font decision. It is history, and this plan is the record of the reversal.

## Verification

`./scripts/run.mjs check-diff`.