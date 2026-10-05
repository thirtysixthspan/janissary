# Match shell reply decorations to the terminal line height

## Complexity

2/10. The fix changes shell reply measurement, its regression test, and the shell tab spec.

## Root cause

The hidden markdown probe inherited the application transcript's line height instead of using xterm's rendered row height. Xterm then gave the decoration a 19 px line box while the probe measured at a different size. A `help` reply reproduced the mismatch: the decoration was 5,187 px tall, its content needed 5,446 px, and the document grew to 984 px in an 800 px viewport.

## Correct behavior

The hidden probe uses the measured xterm row height, so the height reserved for the reply matches the rendered decoration's line boxes. The entire reply fits inside the decoration, the application window has no vertical scrollbar, and xterm remains the only scrollable surface.

## Reproduction

In a scratch app, type `zsh` in the command bar and then `help` in the shell tab. The rendered `.shell-output-block` measured 5,187 px high with a 5,446 px scroll height; the document measured 984 px high against an 800 px viewport. No browser console errors occurred.

## Approach

Measure one terminal row from the screen height and row count before measuring the markdown. Apply that pixel height to the hidden probe's line height, matching xterm's rendered cell geometry so the reserved row count covers the final content.

## Implementation steps

1. Set the measurement probe's line height to the xterm row height and add a regression assertion that checks the probe uses that exact pixel height.
2. Update the shell tab spec to state that the reply fits its reserved decoration and does not create an application-window scrollbar.

## Regression test

`web/src/plugins/shell/markdown-block.test.ts` checks the measurement probe's line height equals the screen height divided by terminal rows, preventing a mismatch between measured content and xterm's decoration grid.

## Verification

Run `./scripts/run.mjs check-diff`. For the live check, start a scratch instance, open a `zsh` tab, submit `help`, and measure the rendered decoration, its content, the document, and the xterm viewport. Verified: the probe and decoration both measured 19 px line boxes; the decoration and content were both 5,453 px tall; the document was 800 px in an 800 px viewport; and xterm retained its own scroll viewport.

## Out of scope

Changing markdown layout, decoration placement or fallback behavior, terminal scrolling, and the global transcript line height.
