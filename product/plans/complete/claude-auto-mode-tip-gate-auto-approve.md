# Auto-Approve Claude's Subagent Gate With the Auto-Mode Tip

**Complexity: 2/10** — a one-function change to the claude gate detector's anchor line, plus fixtures.

## Goal

Auto-approve answers this claude permission gate, raised by a subagent on a narrow screen:

```
─────────────────────────────────────────────────────────────────
 Bash command · from the general-purpose agent
 Tip: auto mode handles these prompts for you — choose "switch
 to auto mode" below
 Run shell command
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
 │ git checkout master && git pull origin master 2>&1 | tail -5
 │ && ./scripts/run.mjs check-malicious-package --audit
 │ ./package-lock.json 2>&1 | tail -5; echo exit=$?
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
 A variable in this command can't be checked before it runs

 Do you want to proceed?
 ❯ 1. Yes
   2. Yes, and switch to auto mode · auto mode handles these
      prompts for you
   3. No
```

## Approach

The gate on its own already matches the structural detector: a highlighted `❯ 1. Yes`, a later `3. No`, and no live input caret below. A screen holding only this dialog therefore passes, so the failure has to come from what sits above it. The detector anchors on the *first* highlighted `❯ 1. Yes` line on the screen. When gate-shaped text sits higher up, the first-match anchor fails. That text can be a quoted or echoed gate in the transcript (this very gate appears in the backlog the agent reads), followed by a `❯` prompt line. The detector then evaluates the stale block, finds a `❯` line below its options, and rejects the screen, so the live gate at the bottom is never answered.

Anchor instead on the *last* highlighted `❯ 1. Yes` line. A live gate is always the lowest menu on screen. Stale gate-shaped text that has been superseded by claude's own prompt is still rejected, because then the last `❯ 1. Yes` is the stale one and the caret sits below it.

## Implementation steps

1. `src/harness/auto-approve.ts`: in `detectClaudeGate`, locate the yes-default line with `findLastIndex` rather than `findIndex`.

## Tests

- `src/harness/auto-approve.test.ts`: add the reported gate as `SUBAGENT_AUTO_MODE_TIP` in the matched-gate set.
- `src/harness/auto-approve.test.ts`: a screen with a stale gate-shaped block, then a `❯` prompt line, then the live reported gate matches.
- Existing: a gate-shaped block that scrolled above claude's live input caret still does not match.

## Spec and docs

- `product/specs/harness.md` — the auto-approve paragraph: the lowest highlighted menu on screen is the one checked, so gate-shaped text higher in the transcript does not mask a live gate below it.

## Out of scope

- Selecting any option other than the highlighted default (never "switch to auto mode").
- Gate detection for other harnesses.
