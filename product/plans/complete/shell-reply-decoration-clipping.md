# Clip shell reply decorations to the terminal

## Complexity

2/10. The fix bounds the shell terminal surface, with a stylesheet regression test and a concise spec clarification.

## Root cause

Xterm positions reply decorations in its terminal layer, which has z-index 7. When a tall reply is shown at the terminal's bottom, `position` places its decoration thousands of pixels above the terminal viewport so the visible tail lines up with the prompt. The shell body has no overflow clip, so that decoration paints across the metadata row and tab strip.

## Correct behavior

A shell reply decoration stays within the shell terminal's body, below the metadata row and tab strip. Scrolling the terminal still reveals the visible portion of the reply, and the decoration does not create an application-window scrollbar.

## Reproduction

In a scratch app, type `zsh` in the command bar and then `help` in the shell tab. The decoration's bounding box began at y=-4728 and extended to y=725 in an 800 px viewport; its z-index was 7, above the tab strip and metadata. The screenshot showed reply content covering the top of the window. The document remained 800 px tall and the browser console had no errors.

## Approach

Clip the shell terminal body so xterm decorations extending outside its viewport cannot paint over neighboring app chrome. Pin the clipping declaration in a stylesheet test.

## Implementation steps

1. Add a stylesheet regression test requiring the shell terminal body to clip overflow and confirm it fails before the fix.
2. Set `overflow: hidden` on the shell terminal body and update the shell tab spec with the visible boundary for reply decorations.

## Regression test

`web/src/plugins/shell/shell-style.test.ts` asserts the shell body clips overflow, keeping tall xterm reply decorations from covering the metadata row and tab strip.

## Verification

`./scripts/run.mjs check-diff` passes. In the live scratch instance, the `zsh` then `help` flow still measured a 5,453 px decoration starting at y=-4,728, but `elementFromPoint` at the tab strip and metadata row hit their own UI elements rather than the decoration. The document stayed 800 px tall in an 800 px viewport, and the browser console had no errors. The screenshot showed the tab strip and metadata row unobscured above the terminal content.

## Out of scope

Changing reply measurement, xterm z-index, terminal scrollback, markdown layout, or non-shell tabs.
