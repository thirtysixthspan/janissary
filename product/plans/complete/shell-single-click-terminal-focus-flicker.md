# Shell single-click terminal focus flicker

## Complexity

3/10. One small module in the shell plugin, wired where the terminal is opened, plus a focused regression test. The difficulty is only in knowing that xterm.js takes focus itself on mousedown.

## Root cause

xterm.js registers an always-on `mousedown` listener on its own element that calls `preventDefault()` and then `terminal.focus()`, which focuses its hidden helper textarea. That listener runs on the press, long before the shell tab's `onClick` hands the keyboard back to the command bar on release. So for the whole time the mouse button is held, the terminal holds focus: `.shell-body:focus-within` lights the focus line in the tab colour, the prompt mask uncovers zsh's prompt, and the cursor appears. Then the click moves focus back to the bar, and all of it reverts. The earlier fix (`shell-tab-click-focus.md`) moved the click to the command bar, but its test fired only a `click` event, so it never exercised xterm's mousedown.

## Correct behavior

A single click on the shell terminal leaves keyboard focus on the command bar (or returns it there from the terminal) without the terminal ever taking focus, so the focus line, prompt and cursor show no change. A double-click still focuses the terminal for direct zsh input. This is what the bug report asks for and what `product/specs/shell-tab.md` ("Choose where keys go") describes.

## Reproduction

- Unit: `web/src/plugins/shell/useShellTerminal.press-focus.test.ts` stubs xterm with an element whose mousedown listener focuses its textarea, as `CoreBrowserTerminal.bindMouse` does. A single primary `mousedown` (detail 1) on the terminal screen moved `document.activeElement` from the command bar to xterm's helper textarea. The test failed against the unfixed code.
- Live: in a scratch instance of the unfixed build, `zsh --no-workspace` opened a shell tab, and a driver pressed the left mouse button on the terminal for 150 ms and released it. During the press the helper textarea held focus and `.shell-body` matched `:focus-within`. The textarea received 1 focus event, and 10 of 37 sampled animation frames showed the focus line lit in the tab colour (`rgb(238, 90, 36)`) before focus returned to the command bar.

## Approach

Stop xterm's mousedown focus for a single primary press, while leaving xterm's other mousedown work (selection, mouse reporting) untouched. A capture-phase `mousedown` listener on the terminal container runs before xterm's listener. When the press is the primary button, is the first of a click sequence (`detail` at most 1), and the terminal does not already hold focus, it disables xterm's helper textarea so xterm's `focus()` call is a no-op. A listener on xterm's own element, registered after xterm's, re-enables the textarea at the end of the press; it runs even when xterm's selection service stops the press from propagating, because that does not skip listeners on the same element. Every press also releases any earlier hold before deciding on its own, and a fallback on the next task releases a press stopped before it reached xterm's element. Releasing on the next task alone is not enough: browsers deliver input events ahead of timers, so a fast double-click's second press and its `dblclick` arrived while the textarea was still disabled, and the terminal never took focus (observed in the first live run of this fix). The shell tab's existing `onClick` (focus the bar) and `onDoubleClick` (focus the terminal) stay as they are. The second press of a double-click has `detail` 2, so xterm focuses the terminal as before.

## Implementation steps

1. Add `web/src/plugins/shell/press-focus.ts` exporting a function that installs the capture-phase guard on a container for a terminal's helper textarea and returns a disposer. Give it a short comment explaining why xterm's own mousedown focus has to be held off.
2. In `useShellTerminal.ts`, install the guard after `terminal.open(container)` and dispose it in the effect's cleanup.
3. Update the stale comment above the terminal body in `ShellTab.tsx` ("Clicking the terminal gives it focus…") to describe the single-click and double-click behavior.

## Regression test

`web/src/plugins/shell/useShellTerminal.press-focus.test.ts`, written first and watched fail:

- a single press, release and click on the terminal never focuses the terminal's textarea, and the command bar stays focused throughout;
- the second press of a double-click still focuses the terminal, even with no task between the two presses;
- as soon as a single press is over, the terminal can still be focused through the handle's `focus()` (as `Shift+Tab` and double-click do);
- a press stopped before it reached xterm's element is released on the next task.

## Verification

- `./scripts/run.mjs check-diff` passes, including the new test.
- Live end-to-end: build the fixed tree, start a scratch instance, and rerun the same driver (`temp/fix-a-bug-drivers/verify.mjs`). It opens `zsh --no-workspace`, holds a single press on the terminal for 150 ms, and samples every animation frame. Expected: no focus event on the helper textarea, no frame with the focus line lit, the command bar focused during and after the press, a double-click focusing the terminal, and a single click from the focused terminal returning focus to the command bar.

## Spec and documentation

`product/specs/shell-tab.md` ("Choose where keys go") gains one sentence: a single click never focuses the terminal, even while the button is held, so the focus line, prompt and cursor do not change. `help.md` and the user documentation already describe single-click and double-click behavior correctly and need no change.

## Out of scope

- Right-click and middle-click focus behavior on the terminal.
- The command bar briefly losing focus between the two clicks of a double-click (the second `click` event before `dblclick`).
- Focus behavior of harness, SSH, or PTY takeover terminals.
