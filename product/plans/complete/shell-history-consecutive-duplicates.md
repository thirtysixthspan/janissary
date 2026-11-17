# Skip consecutive duplicates in the shell tab's own history

**Complexity: 1/10** — a one-line guard in one client helper, matching the rule the server already applies (~2 added lines, 1 requirement, 3 scenarios, p=3.11).

## Goal

Running the same command twice in a row in a shell tab puts it in that tab's Ctrl+R history twice. The helper that records shell commands trims the line and appends it unconditionally, so the picker shows two identical rows for one repeated action. Consecutive repeats should collapse to one entry, the same way the server's tab history already does.

## Root cause

`appendShellHistory` in `web/src/plugins/shell/shell-history.ts` returns `[...previous, entry]` for every non-empty trimmed line. It never compares `entry` with `previous.at(-1)`. The shell tab's Ctrl+R is claimed by the shell plugin and reads this client-side `sent` list, so it never benefits from `recordHistory` in `src/tab/history.ts`, which already skips a repeat with `tab.cmdHistory.at(-1) !== trimmed`.

## Correct behavior

A submitted line that, after trimming, equals the most recent history entry leaves the history unchanged. A repeat separated by another command is still recorded. Empty and whitespace-only lines are still discarded, and surrounding whitespace on a kept line is still trimmed.

## Reproduction

Added failing cases in `web/src/plugins/shell/shell-history.test.ts`: submitting `notify dupcmd` when it is already the last entry produces two rows, and `appendShellHistory(history, 'notify dupcmd')` returns a new two-element array instead of the original history. The separated-repeat case already passes, which is the control that the change must not break.

## Approach

Add one comparison alongside the existing empty-line check. Keep the function's identity-preserving behavior for the empty-line path and extend it to the duplicate path, so React's state setter can skip a re-render when nothing changed.

## Implementation steps

1. `web/src/plugins/shell/shell-history.ts` — return `previous` unchanged when `entry === previous.at(-1)`, after the existing empty-line guard and before the append.
2. Update `product/specs/history.md` only if its wording needs to name the shell tab's own picker explicitly; the rule itself already states the behavior.

## Regression test

`web/src/plugins/shell/shell-history.test.ts` — `skips a command identical to the last entry` covers both the exact and the trimmed-with-whitespace form and asserts the original array is returned; `keeps a repeat separated by another command` asserts a non-consecutive repeat is still appended. Both fail before the change for the duplicate case and pass after.

## Verification

Automated: `$janissary/scripts/run.mjs check-diff` passes, including the new cases.

Live E2E: start a scratch instance, open a shell tab, submit `notify dupcmd` twice, then `notify othercmd`, and press Ctrl+R. The driver records the picker rows; they must be `notify dupcmd` once followed by `notify othercmd`, with no duplicate row. If the start task cannot build here or the browser is unavailable, record the reason and skip the live check.

## Out of scope

- Changing the server's `recordHistory`, which already implements the rule.
- Deduping non-consecutive repeats. The spec only suppresses a match with the last entry.
- Changing how the picker displays or orders rows.
