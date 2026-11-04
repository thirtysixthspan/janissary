# Finish the Ctrl+T retirement in the shared transcript card

**Complexity: 2/10** — two stale comments, one key-filter predicate, one stale CSS comment and pointer rule, a focused test extension, and one spec sentence.

## Goal

The inline terminal card stops blocking Ctrl+T. The retired collapse chord disappears from the card's comments, and a bare Ctrl+T reaches the card's PTY like any other terminal key. Shift+Arrow and Ctrl+Arrow still bubble so tab switching and reordering keep working while the card is focused. The ACP prompt and output line style no longer implies that clicking a line re-collapses anything; it reads as a read-only transcript line.

## Background (verified)

- `web/src/shared/transcript/TerminalCard.tsx` has two comments naming Ctrl+T as an app-level collapse chord, and `cardKeyFilter` returns false for every Ctrl or Shift keydown, so the PTY never receives Ctrl+T.
- Commit `bd8f21a7` removed the Ctrl+T window shortcut and the `toggleCollapse` RPC. `web/src/useWindowKeys.ts` now handles only Ctrl/Shift+Arrow tab moves, and `web/src/useWindowKeys.test.ts` pins that Ctrl+T is left to the focused surface.
- `web/src/theme.css` labels `.line.prompt.acp` and `.line.output.acp` as expanded agent tool steps that re-collapse on click, and gives both a pointer cursor. The current collapsible transcript branch is the separate `line.collapsed` style, which stays.
- The ACP prompt and output lines are rendered for read-only consumers whose collapse callback is a no-op, so the pointer affordance promises an action nothing performs.
- `product/specs/transcript.md` already states that no transcript surface collapses ACP tool steps; it does not yet describe what an inline terminal card forwards or lets bubble.

## Approach

Keep the existing rule that Shift and Ctrl chords bubble, but exempt a bare Ctrl+T from that rule so the PTY receives it. Reword both comments to name only the tab chords the window still handles. Replace the theme comment and pointer cursor with wording for a read-only ACP line, leaving the muted color and output indentation intact. Extend the focused key-filter test, and add one spec paragraph describing the card's forwarding rule.

## Implementation steps

1. In `web/src/shared/transcript/TerminalCard.tsx`, update the two comments and let a bare Ctrl+T pass `cardKeyFilter` while every other Ctrl or Shift keydown still returns false.
2. In `web/src/theme.css`, replace the expanded-and-re-collapse comment with read-only ACP line wording and remove the pointer cursor from `.line.prompt.acp` and `.line.output.acp`.
3. Extend `web/src/shared/transcript/TerminalCard.test.tsx`: a bare Ctrl+T passes the filter, Ctrl+Arrow and Shift+Arrow are blocked, and plain keydown and keyup pass.
4. Add an inline-terminal-card paragraph to `product/specs/transcript.md` describing Ctrl+T reaching the PTY and the tab chords bubbling.
5. Run `$janissary/scripts/run.mjs check-diff`, promote the plan, and remove the resolved backlog entry.

## Tests

- `web/src/shared/transcript/TerminalCard.test.tsx` asserts `Ctrl+T` passes, `Ctrl+ArrowLeft`/`Ctrl+ArrowRight` and `Shift+ArrowUp`/`Shift+ArrowDown` fail the filter, and plain keydown/keyup pass; the existing blocked `Ctrl+A` assertion stays.
- `$janissary/scripts/run.mjs check-diff` covers lint, typecheck, and affected tests.

## Out of scope

- The shared transcript renderer's inert `collapsed` branch and the ACP prompt/output click handlers or tooltips in `transcript-line.tsx`.
- `flattenBuffer`'s collapse helper.
- The notifications feed.
- Connection-tab `<details>` rendering.
- Help pages and user documentation, which do not describe Ctrl+T on an inline terminal card.
