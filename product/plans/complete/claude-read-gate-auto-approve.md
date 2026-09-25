# Auto-Approve Claude's Four-Option Read Gate

**Complexity: 1/10** — the detector already recognizes this gate; the work is pinning it with a regression fixture and naming it in the spec.

## Goal

Auto-approve recognizes claude's four-option read permission gate and accepts its highlighted `❯ 1. Yes` default:

```
 Do you want to proceed?
 ❯ 1. Yes
   2. Yes, allow reading from ... from this project
   3. Yes, and switch to auto mode · auto mode handles these prompts for you
   4. No

 Esc to cancel · Tab to amend
```

## Approach

The claude detector matches on menu structure: a highlighted `❯ 1. Yes` line, a later `No` option numbered `2.` through `9.`, and no live input caret below that option. The widening to `9.` landed in the four-option "This command requires approval" fix (#1178), merged minutes before this issue was filed. The read gate has the same structure — `No` at option 4 — so it is already detected, which a fixture run against the current detector confirms. No detector change is needed. Pin the gate with a fixture so a future narrowing of the option-number check cannot drop it silently, and name the read variant in the spec. Enter still accepts option 1, plain "Yes", never "allow reading" or "switch to auto mode".

## Implementation steps

1. `src/harness/auto-approve.test.ts`: add the four-option read gate as a fixture in the matched-gate set.
2. `product/specs/harness.md`: the auto-approve "How it works" paragraph names the "Yes, allow reading from … from this project" four-option gate alongside the "don't ask again" one.

## Tests

- `src/harness/auto-approve.test.ts`: `READ_FOUR_OPTION` fixture joins `ALL_GATES`, so `detectPermissionGate(…, 'claude')` must return true for it.

## Out of scope

- Selecting any option other than the highlighted default.
- Gate detection for other harnesses.
- Changes to `help.md` or user documentation, which describe auto-approve without enumerating gate variants.
