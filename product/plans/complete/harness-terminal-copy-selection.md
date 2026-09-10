# Let terminal text be selected and copied while a harness holds the mouse

**Complexity: 3/10** — one option on the shared xterm construction, one pure chord predicate beside the two that already live in `terminal-keys.ts`, and one branch in the shared key handler. No new modules, no new components, no protocol change.

## The bug

> copy and paste via key bindings or context menus do not work from harness tabs, like claude. Part of the problem may be the selection of text to be copied.

## Root cause

A harness turns on mouse reporting as soon as it starts. Spawning `claude` under a PTY and reading its first output shows it emitting `?1000h ?1002h ?1003h ?1006h` — button, drag, any-motion, and SGR-extended tracking — within the first two kilobytes, before the user can touch anything.

xterm.js answers that by switching its selection service off wholesale: `CoreBrowserTerminal`'s `onProtocolChange` handler calls `this._selectionService.disable()` the moment any mouse protocol becomes active, so the program rather than the terminal owns the mouse. Every emulator does this, and every emulator keeps one escape hatch — a modifier that forces a selection anyway. xterm's is `SelectionService.shouldForceSelection`, which reads `event.shiftKey` off macOS but on macOS reads `event.altKey && macOptionClickForcesSelection`. That option defaults to `false`, and `useXterm` never sets it.

So on macOS the escape hatch is bolted shut. `handleMouseDown` returns early for every drag, no selection is ever made, and everything downstream of a selection fails with it:

- **Cmd+C** — xterm's copy listener opens with `if (!this.hasSelection()) return;`, so it copies nothing.
- **Right-click** — `rightClickHandler` loads the hidden textarea with `selectionService.selectionText`, which is `''`, so the browser's own menu offers a Copy with nothing behind it.

That is the whole of what the reporter saw, and it is what their own hunch pointed at. Paste is not implicated: Cmd+V (Ctrl+V off macOS) fires a native `paste` event on xterm's helper textarea, which xterm forwards to the PTY, and that path never depended on a selection.

Separately, the chord terminals everywhere else use for copy — `Ctrl+Shift+C` — is bound by nothing in the app and nothing in xterm, so off macOS, where `Ctrl+C` must stay an interrupt, there is no copy key binding at all.

## Reproduction

1. Spawn `claude` under a real PTY with `node-pty` and scan its first output for private-mode sets (throwaway script under `temp/`). Observed: `MOUSE TRACKING sequences: ?1000h ?1002h ?1003h ?1006h ?1004h`.
2. In a real Chromium, drive a page holding an xterm terminal built with exactly the options `useXterm` passes. With a selection present, `Meta+c` puts the selected text on the clipboard and `Meta+v` delivers the clipboard to the PTY — so both chords work *given a selection*. `Control+Shift+v` delivers nothing at all (`pty data after Ctrl+Shift+V: []`), confirming the second gap.
3. As an automated failing test: `web/src/harness/HarnessTab.test.tsx` → "creates the terminal so a modifier-drag still selects while the harness holds the mouse" reads the captured `Terminal` options and finds `macOptionClickForcesSelection` `undefined`, and the two copy-chord tests find the key handler returning `true` (pass the key to the harness) with the clipboard never written.

## Correct behavior

A harness tab's text can be selected with the terminal-standard forcing modifier even while the harness owns the mouse — Option+drag on macOS, Shift+drag elsewhere — and that selection reaches the system clipboard from the keyboard with `Cmd+C` or `Ctrl+Shift+C`. `Ctrl+C` keeps going to the harness as an interrupt, and a copy chord pressed with nothing selected is passed to the harness untouched.

## Approach

**The option, not a workaround.** `macOptionClickForcesSelection: true` is the supported way to say "let the user force a selection with the modifier"; it is the same switch VS Code exposes as `terminal.integrated.macOptionClickForcesSelection`. It costs Alt-column-select and alt-click-to-move-cursor on macOS — `shouldColumnSelect` and the alt-click path both stand down when it is on — which is the trade every terminal makes, and the right one when the alternative is text that cannot be selected at all.

**Set it in `useXterm`, not in `HarnessTab`.** The cause is in the shared terminal construction, and the same TUI-with-mouse-reporting situation arises in a shell tab's PTY takeover and in a transcript terminal card. Fixing the hook fixes all three, which is how `terminal-keys.ts`'s Shift+Enter and Alt+Arrow translations already work — the harness spec calls that out as applying to "every xterm.js terminal in the app".

**Copy by chord, from the terminal's own selection.** A pure `copySelectionChord(e, isMac)` beside `shiftEnterSequence` and `altArrowSequence`, matching `Ctrl+Shift+C` on every platform and `Cmd+C` on macOS only. The handler acts on it only when `term.hasSelection()` is true; otherwise it returns `true` and the key goes to the harness, which keeps `Ctrl+C` an interrupt and leaves a selection-less `Cmd+C` inert as before. The branch sits *after* the `keyFilter` call so an open picker overlay still claims the key first.

**Paste is left alone.** It already works on both platforms through the browser's native `paste` event, and the editor's own key map records the same reasoning for deliberately not binding Cmd+V. Binding `Ctrl+Shift+V` would mean `navigator.clipboard.readText()` and its permission prompt, for a chord no reported failure involves.

**No app context menu.** Restoring the selection restores the browser's own right-click Copy, which is the path xterm's `rightClickHandler` is written to serve. A second, app-drawn menu would replace a working one.

## Implementation steps

1. `web/src/terminal-keys.ts` — add `copySelectionChord(e, isMac)`, returning whether the event is the copy chord for the platform, in the style of the two predicates already there.
2. `web/src/useXterm.ts` — pass `macOptionClickForcesSelection: true` to the `Terminal` constructor, and add the copy branch to `attachCustomKeyEventHandler` after the `keyFilter` call: on a match with a live selection, write `term.getSelection()` to the clipboard and return `false`.
3. `product/specs/harness.md` — record the selection gesture and the copy chord under "Input model", alongside the Shift+Enter note that already generalizes to every terminal in the app.
4. `documentation/user-documentation/advanced-agents/harness.md` — the input paragraph currently says only two things are held back from the harness; add the copy chord and the selection gesture.

## Regression test

`web/src/harness/HarnessTab.test.tsx`, under "selecting and copying terminal text" — the only test file that drives the real `useXterm` through a mocked `Terminal`, so both the constructor options and the key handler are observable:

- **creates the terminal so a modifier-drag still selects while the harness holds the mouse** — the captured constructor options carry `macOptionClickForcesSelection: true`. This is the root-cause guard; it fails against the unfixed code with `undefined`.
- **copies the terminal selection on Cmd+C instead of passing it to the harness** — with a selection and a Mac platform, the handler returns `false` and the clipboard is written with the selection.
- **copies the terminal selection on Ctrl+Shift+C** — the same, without the platform spy.
- **leaves Ctrl+C alone so it still interrupts the harness** — returns `true` and writes nothing, even with a selection present.
- **passes the copy chord to the harness when nothing is selected** — returns `true` and writes nothing.
- **leaves the copy chord to an open picker rather than claiming it** — with `taskPickerOpen`, the key bubbles and nothing is copied.

The last three fail if the fix over-reaches; the first three fail without it.

## Out of scope

- **A paste key binding.** Cmd+V and Ctrl+V already reach the PTY through the native paste event. `Ctrl+Shift+V` is unbound and stays that way rather than introducing a `clipboard-read` permission prompt for a failure nobody reported.
- **An in-app context menu on the terminal.** The browser's own menu is what xterm's right-click handler prepares, and it starts working again as soon as a selection can exist.
- **Copy/paste anywhere but the xterm terminals.** The agent transcript, the editor, and the file navigator each have their own working clipboard paths.
- **The `## development` entry in `product/backlog/bugs.md`.** The bug was named at invocation and sits outside `## ready`, so the file is left untouched.

## Verification

Automated: `./scripts/run.mjs check-diff` after each step.

Manual (not possible in this workspace — the contained browser was lost mid-session and one cannot be launched from inside the sandbox): open a `claude` harness tab, Option+drag across some of its output, confirm the selection paints, press Cmd+C, and paste it elsewhere.
