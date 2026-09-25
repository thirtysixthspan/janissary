# Auto-Approve Claude's Four-Option Permission Gate

**Complexity: 2/10** — the claude gate detector already matches on menu structure; it only rejects this gate because the final `No` option is numbered `4.`.

## Goal

Auto-approve recognizes claude's four-option permission gate and accepts its highlighted `❯ 1. Yes` default:

```
 This command requires approval

 Do you want to proceed?
 ❯ 1. Yes
   2. Yes, and don’t ask again for: python3 -
   3. Yes, and switch to auto mode · auto mode handles these prompts for you
   4. No

 Esc to cancel · Tab to amend
```

## Approach

The claude detector requires a highlighted `❯ 1. Yes` line, a later `No` option line, and no live input caret below that option. The `No` option check accepts only options numbered `2.` or `3.`, so a menu with two extra "Yes, and …" options is never recognized. Widen that check to any option numbered `2.` through `9.` whose text starts with `No`. The injected keystroke stays Enter, which accepts the highlighted option 1 — plain "Yes", never "switch to auto mode".

## Implementation steps

1. `src/harness/auto-approve.ts`: `isNoOptionLine` accepts a single-digit option number from 2 to 9, still tolerating a missing space after the dot.

## Tests

- `src/harness/auto-approve.test.ts`: add the four-option "This command requires approval" gate as a fixture in the matched-gate set.
- `src/harness/auto-approve.test.ts`: a menu whose only later option is a `Yes` (no `No` option) still does not match, and a `1. No` line does not count as the `No` option.

## Spec and docs

- `product/specs/harness.md` — the auto-approve "How it works" paragraph: the final `No` option may be numbered 2 through 9, covering claude's four-option gate.

## Out of scope

- Selecting any option other than the highlighted default.
- Gate detection for other harnesses.
