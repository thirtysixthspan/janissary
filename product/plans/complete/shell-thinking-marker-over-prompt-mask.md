# Paint the shell thinking marker above the idle prompt mask

**Complexity: 2/10** — ~4 added lines in 1 production file, 2 visibility requirements and 3 test scenarios (p=3.51).

## Summary

Backlog bug: when querying an ACP agent from the shell, the `Thinking` label is not entirely visible — it reads `  inking <spinner>` — and the settled `see thought process` link covers the start of the answer.

An accepted `ask`, `tell`, or `subagent` prompt leaves a `Thinking` decoration on the row below its echoed command. The shell also keeps a prompt mask that hides the idle zsh prompt (`> `) whenever the terminal is unfocused, which is the normal state while the user types in the command bar. Both are top-layer xterm decorations on the same row. Xterm assigns every top-layer decoration `z-index: 7`, so the mask, registered on each parsed write, paints after the marker and covers its first two cells. The label therefore renders as `  inking`; the same masking applies to the settled link until the answer write moves the cursor. The answer-rows overlap described in the same report was already removed by the existing `reserveRow` write in `insertMarkdownBlock`.

The fix lifts the thinking marker above the prompt mask so its full label and link stay visible on the masked row. Nothing else about placement, content, or the answer's reserved row changes.

## Root cause

`web/src/plugins/shell/thinking-marker-decoration.ts` gives the marker the class `shell-thinking-marker` and leaves xterm's `z-index: 7` in place. `web/src/plugins/shell/prompt-mask.ts` paints `.shell-prompt-mask` over the first two cells of the cursor row with the same z-index, later in DOM order. On the row below the echo those two decorations coincide, so the mask hides the `Th` of `Thinking` and the `se` of `see thought process`.

## Correct behavior

The `Thinking` marker and its settled `see thought process` link render in full at the left edge of the row below the echoed command, including while the shell is idle and the terminal is unfocused. The answer still starts one row below the marker.

## Reproduction

Started a scratch instance of the unmodified checkout (`master@147ab1d7`), opened a shell tab, and submitted `ask size of a manhole cover in san francisco` from its command bar while polling the DOM every 25 ms. The first `Thinking` marker and the prompt mask had identical row geometry (`x: 16, y: 79, h: 19`; marker width 87 px, mask width 16 px) and identical computed `z-index: 7`. The screenshot `reproduce-marker.png` shows `inking` preceded by a two-cell gap and a spinner, instead of the full `Thinking` label. The checkout's ACP models were unavailable, so the failure reply removed the marker before the link could be observed; the link uses the same decoration element and therefore the same stacking.

## Approach

Set an inline `z-index` on the marker decoration above xterm's top-layer value. An inline style wins over xterm's stylesheet rule regardless of selector specificity, covers the whole lifetime of the decoration (running and settled), and is re-applied wherever the marker's other inline styles are set. The mask keeps its job of hiding the `> ` prompt behind the marker's own opaque background.

## Implementation steps

1. In `web/src/plugins/shell/thinking-marker-decoration.ts`, add a named constant for the marker's stacking value above xterm's top layer and set `element.style.zIndex` to it in `fill()`, beside the existing `shell-thinking-marker` class assignment. Include a short comment explaining that the idle prompt mask shares the marker's row and xterm paints both top-layer decorations at the same z-index, which is why the marker must be lifted. The file stays well under the 200-line limit; no new module is needed.
2. Extend `web/src/plugins/shell/thinking-marker-decoration.test.ts` with a regression test asserting the marker's inline z-index is above the value xterm gives top-layer decorations, so a mask on the same row cannot cover its label. Mirror the file's existing `mount`/`render` helpers and assertion style.
3. Update `product/specs/shell-tab.md` so the marker paragraph states the full label stays visible while the shell sits idle at its prompt. No help or user-documentation change is needed: neither describes the label being clipped or the mask.

## Regression test

`web/src/plugins/shell/thinking-marker-decoration.test.ts`: a new case in the `content` block, `paints above the prompt mask sharing the marker row so its whole label stays visible`, renders a running marker and asserts `Number(element.style.zIndex) > 7`. Without the change the inline z-index is empty (`0`) and the test fails; with it the value is `8` and the test passes.

## Verification

- Run `$janissary/scripts/run.mjs check-diff` and confirm lint, typecheck, and the affected `client` tests pass, including the new regression test.
- Re-run the reproduction driver from `./temp/fix-a-bug-drivers/reproduce.mjs` against a freshly built scratch instance: with the fix, the running marker's computed z-index exceeds the mask's and a screenshot shows the complete `Thinking <spinner>` on the row below the echoed command.
- The settled-link path uses the same decoration element, so the same stacking applies; the existing tests cover the running-to-link transition and the answer's reserved row.

## Out of scope

- Changing the marker's position, label, spinner, tooltip, accessible name, click behavior, or lifetime.
- The prompt mask's own behavior, the zsh prompt text, or how the answer block reserves rows.
- CSS changes, new modules, wire-contract changes, and documentation that does not already describe this placement.
