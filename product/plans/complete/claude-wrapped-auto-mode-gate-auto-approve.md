# Auto-Approve Claude's Subagent Gate With a Wrapped Auto-Mode Option and Truncated Footer

**Complexity: 1/10**: a regression fixture, two tests, and a spec sentence. The current detector already matches the reported gate.

## Goal

Auto-approve answers this claude permission gate from the backlog. A subagent raised it while background agents were running. The "switch to auto mode" option wraps onto a second line, and the footer's background-agent hint is truncated with an ellipsis:

```
─────────────────────────────────────────────────────────────────────
 Bash command · from the general-purpose agent
 Tip: auto mode handles these prompts for you — choose "switch to
 auto mode" below
 Run checks and promote plan to complete
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
 │ $janissary/scripts/run.mjs check-diff && mv
 │ ./product/plans/ready/connections-list-short-column-headings.md .
 │ /product/plans/complete/connections-list-short-column-headings.md
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
 A variable in this command can't be checked before it runs

 Do you want to proceed?
 ❯ 1. Yes
   2. Yes, and switch to auto mode · auto mode handles these prompts
      for you
   3. No

 Esc to cancel · Tab to amend · ctrl+x ctrl+k twice to stop backgro…
```

## Diagnosis

On master, `detectClaudeGate` in `src/harness/auto-approve.ts` already matches this screen. It has a highlighted `❯ 1. Yes`, a later `3. No`, and no live input caret below the options. The wrapped `for you` continuation line and the `…`-truncated footer are neither a `No` option nor a `❯` caret, so they don't affect the result. The screen also matches when a quoted copy of the gate sits higher in the transcript, followed by a `❯` prompt line. That matters here because this exact gate is quoted in the issues backlog the agent reads.

The reported text doesn't show what kept the gate from being answered. A `❯` line pinned below the footer would do it, but none appears in the report. Guessing at a detector change would risk approving screens that aren't gates, so no detector change is made. The new fixture pins the reported shape so a future change to the detector can't drop it.

## Approach

Add the reported screen as a regression fixture to the matched-gate set, alongside the other subagent auto-mode gates. Cover it in the quoted-copy case and through `HarnessAutoApprover`.

## Implementation steps

1. `src/harness/auto-approve.test.ts`: add the reported screen as `SUBAGENT_AUTO_MODE_WRAPPED_TRUNCATED` and include it in `ALL_GATES`.
2. `src/harness/auto-approve.test.ts`: add a test that the gate matches below a quoted copy of itself and a `❯` prompt line.
3. `src/harness/auto-approve.test.ts`: add a `HarnessAutoApprover` test that answers the gate with a carriage return.

## Tests

- `SUBAGENT_AUTO_MODE_WRAPPED_TRUNCATED` matches as a claude gate (through the `ALL_GATES` loop).
- The gate matches below a quoted copy of itself and a `❯` prompt line.
- `HarnessAutoApprover` answers the gate with a carriage return.

## Spec and docs

- `product/specs/harness.md`, auto-approve gate recognition: the subagent gate also matches when its wrapped "switch to auto mode" option is shown whole and the footer's background-agent hint is truncated with an ellipsis.
- No `help/` or user documentation describes gate shapes, so none changes.

## Out of scope

- Any change to detection, capture timing, or the loop guard.
- Selecting any option other than the highlighted default (never "switch to auto mode").
- Gate detection for other harnesses.
