# Auto-Approve Claude's Clipped Subagent Gate

**Complexity: 1/10**: regression fixtures and a spec sentence. The current detector already handles the reported gate.

## Goal

Auto-approve answers this claude permission gate from the backlog. It was raised by a subagent while background agents were running, and it is clipped at the right edge of the screen:

```
──────────────────────────────────────────────────────────────────────────
 Bash command · from the general-purpose agent
 Tip: auto mode handles these prompts for you — choose "switch to auto
 mode" below
 Run shell command
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
 │ $janissary/scripts/run.mjs pr-create-pr thirtysixthspan/janissary
 │ ... ./temp/pr-body.md 2>&1 &&
 │ $janissary/scripts/run.mjs pr-check-mergeable docs/profiles-gaps
 │ thirtysixthspan/janissary 2>&1
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
 A variable in this command can't be checked before it runs

 Do you want to proceed?
 ❯ 1. Yes
   2. Yes, and switch to auto mode · auto mode handles these prompts for
   3. Nou

 Esc to cancel · Tab to amend · ctrl+x ctrl+k twice to stop background ag
```

## Diagnosis

On master, the claude gate detector already matches this screen: there is a highlighted `❯ 1. Yes`, a later `No`-prefixed option (`3. Nou`), and no live input caret below the options. It also matches the screen when a quoted copy of the gate, followed by a `❯` prompt line, sits higher in the transcript. That is the shape #1868 fixed, merged at 12:04 on 2026-10-29. The issue was logged about an hour later, from a run on the `docs/profiles-gaps` branch. A Janissary server started before #1868 still runs the old first-match detector, which explains the missed approval. Restarting the server picks up the fix. No detector change is warranted, and guessing at one would risk approving screens that aren't gates.

## Approach

Pin the reported screen as a regression fixture so a future detector change can't drop it.

## Implementation steps

1. `src/harness/auto-approve.test.ts`: add the reported screen as `SUBAGENT_AUTO_MODE_CLIPPED` to the matched-gate set.

## Tests

- `SUBAGENT_AUTO_MODE_CLIPPED` matches as a claude gate.
- The clipped gate below a quoted copy of itself and a `❯` prompt line matches.
- `HarnessAutoApprover` answers the clipped gate with a carriage return.

## Spec and docs

- `product/specs/harness.md`, auto-approve gate recognition: the subagent gate also matches when it is clipped at the right edge of the screen.

## Out of scope

- Any change to detection, capture timing, or the loop guard.
- Selecting any option other than the highlighted default (never "switch to auto mode").
