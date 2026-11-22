# Scope the monitor tool-loop claim to priming

**Complexity: 1/10** — documentation-only correction: no production files, no requirements on code, no new tests or units (p=1.578). The care is in matching the wording to both real call paths without changing runtime behavior.

## Goal

`product/specs/monitoring.md` currently claims a monitor "uses the command grants of the role its persona declares, through the same tool loop as `ask` and `tell`" without qualifying when that loop runs. The code does not support that as a blanket statement: the priming prompt goes through `promptPersonaRole` (the core tool loop), but each periodic flush in `src/monitor/live-monitors.ts` posts directly to `reg.session.prompt` with no tool host, and its reply is parsed for suggestions rather than executed as commands. Pull request 2170's description repeats the overclaim in its "What" section, saying the autonomous command tool loop "behave[s] identically across" the editor, monitor, and launcher surfaces. Correct both pieces of prose so they describe what the code does, without altering behavior.

## Approach

This is a documentation-fidelity fix, not a code change. Rewrite the single "Role-backed sessions" paragraph in the spec to distinguish the primed session from the flush prompts, and align the one sentence in the pull request's "What" section that carries the identical-over-time claim. Verify by reading the revised prose against both call paths and by confirming the existing priming and flush tests still pass untouched. Leave `src/monitor/session.ts` and `src/monitor/live-monitors.ts` byte-for-byte unchanged.

## Implementation steps

1. In `product/specs/monitoring.md`, rewrite the "Role-backed sessions" paragraph so it states: the declared role configures the monitor's session and its command grants are applied through the core tool loop on the priming prompt; there is no persona-specific allowlist; periodic flush prompts post directly to that session and their replies are parsed for suggestions rather than executed as commands. Keep the adjacent statements about a role granting no commands and about deny-all internal-tool layers intact.
2. In the pull request's "What" section, rewrite only the sentence that claims model fallback, the deny-all internal-tool layers, and the autonomous command tool loop "behave identically across them": keep the identical claims for model fallback and the internal-tool layers, and scope the tool-loop claim to the priming prompt while noting that flush replies are parsed for suggestions rather than executed as commands. Apply it with `gh pr edit --body-file ./temp/pr-body.md` after the commit is pushed, preserving every other character of the body.

## Tests

No new tests. Verify by reading the spec against both call paths and by keeping the existing priming and flush tests in `src/monitor/manager.test.ts` passing unchanged.

## Out of scope

- Any runtime change to `src/monitor/session.ts` or `src/monitor/live-monitors.ts`.
- A design change to run the tool loop on monitor flushes.
- Editing the pull request's title or any section other than "What".
- Editing any other backlog entry.

## Verification

- `$janissary/scripts/run.mjs check-diff` stays green.
- The spec's "Role-backed sessions" paragraph matches `primeMonitorSession` (priming through `promptPersonaRole`) and `flush` (direct `session.prompt` plus `parseSuggestion`).
- `gh pr view 2170 --json body` shows only the named "What" sentence changed; the title and all other sections are unchanged.
