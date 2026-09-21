# Correct the architecture guideline's command-routing section

**Complexity: 1/10** — a one-sentence prose correction in a single guideline file; no code changes.

Section 5 of `ai/guidelines/architecture-principles.md` names a violation of its own
one-command-one-definition rule that has since been fixed — a schedule branch running ahead of the
command registry — which no longer exists in the code. `CommandManager.run` in
`src/command/manager.ts` calls `resolveCommand` first and switches on the resolution; `schedule` is
an ordinary registry entry (`src/commands/schedule.ts`, listed in `coreCommands` in
`src/commands/index.ts`). The branch that actually bypasses the registry today is `shell`, routed to
`CommandManager`'s own `runShell` rather than through `executeCommand`, matching what `ROUTE_NAMES` in
`src/plugins/command-adapter.ts` (`['shell']`) already names.

## Goal

The guideline's second paragraph in section 5 describes the code as it stands: the `shell`
resolution bypasses the registry, not a schedule branch. The paragraph's other two sentences (about
`harness`/`ssh` being ordinary `Command` entries now, and `ROUTE_NAMES` being kept as short as the
branches it shadows) are already accurate and untouched. The rule statement in the third paragraph is
untouched.

## Implementation steps

1. Rewrite the first sentence of section 5's second paragraph in `ai/guidelines/architecture-principles.md` to name the `shell` resolution instead of the schedule branch.

## Tests

None — this is a prose correction to an AI-facing guideline, not to functional code, a spec, or
user-facing documentation. Verification is reading `src/command/manager.ts`, `src/commands/index.ts`,
and `src/plugins/command-adapter.ts` and confirming the rewritten sentence matches all three;
`src/commands.test.ts`, which walks the registry for shadowing, is what keeps the registry claim true
and needs no change.

## Out of scope

- Anything in `src/command/manager.ts`, `src/commands/`, or `src/plugins/command-adapter.ts` — the
  code is already correct; only the guideline's description of it was stale.
