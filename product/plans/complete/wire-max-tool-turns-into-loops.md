# Wire maxToolTurns into every ACP tool loop

**Complexity: 3/10** — ~8 added production lines across 3 files, 4 behavioral requirements and 7 test scenarios (p=4.57); one config reader replaces a constant at three call sites, no new architecture.

## Goal

Make every ACP tool loop use the `maxToolTurns` config value as its command-step cap instead of the hard-coded eight (core) or unlimited (agent). The command-exchange primer must state the same cap the loop enforces, and a remote run's settled answer must report the configured number of steps.

## Approach

- Add one exported helper, `maxToolSteps()`, in `src/acp/drive-loop.ts` that returns `getConfig().maxToolTurns`. Config already validates the value as a positive whole number with a default of 20, so the helper stays a one-line read; no new validation lives in the loop.
- Replace the `CORE_MAX_STEPS = 8` constant with that helper at every site: `corePrimer`'s command-protocol line, `driveToolLoop`'s `maxSteps`, and the local `acp-session-run.ts` step count passed to `finished`. A single reader means the primer and the loop cannot drift apart.
- For agent-kind runs, which today pass `Infinity`, pass the same configured cap. Every loop that drives commands then obeys the setting.
- Keep the loop engine (`src/acp/loop.ts`) unchanged: its `maxSteps ?? 8` default only applies to direct test callers, and all production callers now pass an explicit value.
- Remote loops read config on the machine that hosts the agent (where `driveToolLoop` actually runs); the local side reads its own config only to word the "stopped after N tool steps" suffix. No wire field changes.

## Implementation steps

1. `src/acp/drive-loop.ts` — import `getConfig`, remove `CORE_MAX_STEPS`, export `maxToolSteps()`, call it in `corePrimer` for the protocol primer and in `driveToolLoop` for `maxSteps` on both core and agent snapshots.
2. `src/remote/acp-session-run.ts` — import `maxToolSteps` instead of `CORE_MAX_STEPS` and pass it to `events.finished`.
3. `src/remote/protocol-frames.ts` — update the `acp-run-end` comment to say both sides read the configured cap rather than a shared constant.
4. Run `$janissary/scripts/run.mjs check-diff`.

## Tests

- `src/acp/drive-loop.test.ts`:
  - fix the file to a known cap (8) so existing assertions keep meaning, then add cases that set a custom value and prove `maxToolSteps()` reports it, `corePrimer` states it, a core loop caps at it, and an agent loop caps at it;
  - replace the `CORE_MAX_STEPS` and `Infinity` step-count expectations with the helper's value.
- `src/acp/run-prompt.test.ts`: the passed `maxSteps` equals the configured cap, and the primer matches it.
- `src/remote/acp-session.test.ts`: `finished` reports the configured cap, including a custom value.
- Run `$janissary/scripts/run.mjs check-diff` after the tests.

## Spec and documentation

- `product/specs/acp.md`: replace each "eight"/"8"/`CORE_MAX_STEPS` statement about the command-step cap with the configured `maxToolTurns` value (default 20), covering the primer line, the cap itself, corrections, consumption per step, the capped-suffix text, and the remote-loop notes.
- `product/specs/application-config.md`: change the `maxToolTurns` row from "the tool loop does not read it in this version" to state that all tool loops use it as their command-step cap.
- `documentation/user-documentation/getting-started/configuration.md`: update the `maxToolTurns` row so it describes the live limit rather than only a stored value.
- No `help/` change: no command, flag, or key binding changes.

## Out of scope

- Changing the default of 20, the config decode/fallback rules, or the backfill behavior.
- Adding a runtime command or settings UI for the value.
- Carrying the step count across the remote wire; each side reads the config it has.
- Giving direct callers of `runAcpToolLoop` an implicit config-driven default; they pass `maxSteps` explicitly.
- Capping correction prompts, which consume no command steps today.
