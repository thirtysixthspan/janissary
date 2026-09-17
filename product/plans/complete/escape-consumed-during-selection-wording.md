# Escape is consumed, not forwarded, while a Shift+drag selection is held

Issue: `product/specs/harness.md` and `product/specs/keyboard-navigation.md` (introduced by PR #1129, commit `5e43cb5b`) both say that while a terminal's Shift+drag selection is held, Escape "still reaches the harness as its cancel key" alongside clearing the selection. That contradicts the actual implementation (`web/src/shared/terminal/useSelectionLayer.ts`): the container-level Escape handler calls `preventDefault()` and only clears the selection, so Escape is fully consumed and never reaches the harness while a selection is held — matching the original plan's design decision ("Escape is claimed only while a selection is held"). Fix the wording in both specs to say Escape is consumed, not forwarded, while a selection is held.

Complexity rating: 1/10

## Goal

Correct the two spec passages so they describe the implemented behavior: Escape pressed in a terminal that holds a Shift+drag selection is fully consumed by the selection layer (clears the selection, `preventDefault()`, no `stopPropagation()` needed because the harness's own key handling lives deeper than the capture-phase container listener that already stopped it from mattering) — it never separately reaches the harness as a cancel keystroke. No code changes are required; the implementation in `web/src/shared/terminal/useSelectionLayer.ts` already behaves this way (its container-level `keydown` listener returns after `clear()` with no further dispatch), and this was the design's original intent per its own comment ("Escape is scoped to this surface: a keydown the container receives while an overlay is frozen clears it").

## Approach

This is a documentation-only fix — no source, test, or behavior change. Edit the two spec passages that assert the incorrect "still reaches the harness" behavior so they instead state that Escape is consumed by the selection layer and does not additionally reach the harness while a selection is held.

## Implementation steps

1. In `product/specs/harness.md`, under "Selecting and copying terminal text", rewrite the sentence: "The layer claims no keys: while a selection is held, **Escape** pressed in that terminal clears the selection and still reaches the harness as its cancel key, and an Escape pressed anywhere else…" to state that Escape is consumed by the layer while a selection is held (clearing it) and does not additionally reach the harness, while leaving the rest of the paragraph (the menu exception, the other clearing triggers) intact.
2. In `product/specs/keyboard-navigation.md`, rewrite the sentence "A focused terminal surface … gives every key to its PTY, with two conditional exceptions: while a Shift+drag selection is held, **Escape** pressed in that terminal clears the selection as it reaches the harness, and the terminal's copy chord … copies instead of reaching it." to describe Escape as consumed (clearing the selection, not forwarded) while the copy-chord exception is left describing its own (unchanged, correct) behavior.
3. `documentation/user-documentation/advanced-agents/harness.md` repeats the same misstatement ("the Escape key itself still reaches the harness either way") — correct it too, so the public doc and the specs agree. `help.md` does not describe this interaction, so it needs no change.

## Tests

None — no source behavior changes, so there is no new behavior to cover. `$janissary/scripts/run.mjs check-diff` is still run to confirm the (empty) diff-scoped lint/typecheck/test surface stays green after the markdown-only edit.

## Out of scope

- Any change to `web/src/shared/terminal/useSelectionLayer.ts` or any other source file — the implementation is already correct.
- Any other wording in either spec or the doc page beyond the misstatement about Escape reaching the harness.
- `help.md` — does not document this interaction.

## Specs and docs

- `product/specs/harness.md`: correct the Escape/harness wording in "Selecting and copying terminal text".
- `product/specs/keyboard-navigation.md`: correct the parallel Escape/harness wording in the terminal-surface paragraph.
- `documentation/user-documentation/advanced-agents/harness.md`: correct the matching "Escape key itself still reaches the harness" line in "Copying text out of a harness".
- `help.md`: checked; no update needed (does not document this behavior).
