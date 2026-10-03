# Reconcile the plan's disableStdin decision with the shipped terminal

**Complexity: 1/10** — prose in three files. No code changes.

**Goal.** Stop the plan both forbidding and requiring one line of shipped code. It stated that `disableStdin` "was considered and **not** chosen", listed "no `disableStdin`" under Out of scope, and — two sections later — described the terminal as created with stdin disabled, which is what `web/src/plugins/shell/useShellTerminal.ts` does.

**Approach.** Settle it in favour of what ships and say why both halves are wanted. They are not redundant: focus is where the user is looking, stdin is what would let a keystroke reach the emulator even if it somehow held focus. An unfocused terminal with stdin live still swallows a stray key; a terminal with stdin dead that took focus would look typeable and do nothing.

**Implementation**

1. In `product/plans/complete/shell-tab.md`, rewrite the design decision to state that the terminal is both never focused and built with stdin disabled, and why neither suffices alone.
2. Replace the "no `disableStdin`" clause in that plan's Out of scope entry with the click-to-type path that genuinely is out of scope, noting that refusing input structurally is how the rule is enforced rather than merely arranged.
3. In `product/specs/shell-tab.md`, say the terminal refuses input on its own terms as well as never taking focus.
4. Correct the same one-sentence claim in the pull request description, which repeated it.

## Tests

None: no behavior moves. `web/src/plugins/shell/useShellTerminal.test.ts` already asserts `disableStdin` and `cursorBlink`, which is what makes the claim checkable rather than asserted.

## Out of scope

- Any change to the terminal's options or to the focus handling, both of which already say what they mean.
- `web/src/ShellTab.tsx` and the harness terminal, which are a separate surface.