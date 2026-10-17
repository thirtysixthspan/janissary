# System schedules 12: system grammar and profile schedule isolation

**Complexity: 4/10**

The five forms reuse existing pure time parsing. The change adds one discriminated grammar branch, complete owner routing and migration of the profile parser consumer.

## Goal

Extend the pure schedule parser with the `system` subspace and migrate all parser consumers without changing tab grammar. Source: `product/plans/ready/add-system-schedules.md`.

## Decisions and dependencies

- Dependencies: 07 (script-name validation) and 11 (owner API for the command's new branch). Plan 06's tab-capture/profile-relaunch isolation is separate from these profile-authored schedule-line rules.
- Add `schedule system NAME <form> script <name>` with all five existing time forms, plus `schedule system list`, `cancel <name>`, and `clear`. `system` immediately after `schedule` always selects this subspace, so it cannot be a tab timer name. `in system` retains its ordinary tab-target meaning.
- Parse results gain a discriminated system branch; keep existing tab results source-compatible where possible. System creation reuses existing form parsing/time math, then requires exactly the `script <valid-name>` command tail. It accepts no bare shell/application command and no `in TAB` clause.
- Every malformed system line returns exactly `Usage: schedule system NAME <form> script <name> | schedule system list | schedule system cancel <name> | schedule system clear`. Keep the current tab usage and specific invalid-time/date/interval behavior for tab lines unchanged. Never touch the filesystem in the parser.
- `src/commands/schedule.ts` must handle the new result union in this same change to stay compilable and functional; extract its system execution branch using 11 operations here. This is the one owner of schedule command routing, not a temporary stub. 13 adds the separate runscript commands/completion.
- Profile-authored `schedule` lines are tab-only. Detect/report/skip the system branch before `.target`/`.entry` access. Do not let a profile invoke project schedule creation, management or clear. Preserve duplicate-first behavior, ordinary `run` one-shots, and tab-only recurring harness scope. Profile launch/relaunch remains an in-app operation; an application restart neither restores these tab timers nor launches a profile.

## Existing code to reuse

`src/schedule/{index,helpers,every-schedule,time,usage,types}.ts`, `src/commands/schedule.ts`, and `src/profile/harness-schedule.ts` are the parser's actual consumers. The profile parser's one-shot helper is also used by harness prompt/auto-resume callers and must remain stable.

## File scope

- `src/schedule/{index,types,usage}.ts`; new `src/schedule/system/parse.ts`; `src/commands/schedule.ts`; new `src/commands/schedule-system.ts` as a helper, not a second command definition; `src/profile/harness-schedule.ts`.
- Tests: existing `src/schedule/{index,helpers,manager}.test.ts`, `src/commands/schedule.test.ts`, `src/profile/{harness-schedule,manager}.test.ts`, and `src/controller.test.ts` profile schedule integration; new `src/schedule/system/parse.test.ts`, `src/commands/schedule-system.test.ts`, and `src/schedule/system/grammar.integration.test.ts`. Reuse current tab-timer persistence wording from `product/specs/scheduling.md` when adding project persistence.
- Specs/docs: `product/specs/{scheduling,profiles}.md`, `help.md`, `documentation/user-documentation/automation/{scheduling,profiles}.md`.

## Ordered changes

1. Add a system parser/result branch and exact usage text; reuse form parsing and strict 07 script-name validation.
2. Wire the single schedule command definition to 11 owner operations through the extracted helper. Creating with a missing script refuses and names `.janissary/scripts/<name>.rs` without changing state. Creation reads existence but stores the name only.
3. Implement duplicate system-name semantics: add permits repeated names, cancel-by-name removes all matches, list shows each entry, and clear affects only system entries. Emit `Scheduled <name> system: <spec> (script <script>).`, `No scheduled command "<name>" in system.`, `No scheduled commands in system.`, and `Cleared <n> scheduled commands in system.` exactly where specified, including zero entries and plural `commands` for one clear result.
4. Migrate profile schedule parsing to report and skip every system subspace line. Update specs/help without moving other command execution into the parser.

## Tests and verification

Cover all five system creation forms; case handling of grammar keywords; valid script names; malformed management/trailing arguments; absent/extra `script` clauses; every tab usage/value-error regression; refusal of tab timer name `system`; duplicate system names; cancel-all-name versus one-key owner cancellation; exact messages; missing script path/no mutation; profile system add/list/cancel/clear skipping; and ordinary profile schedules/run entries.

Run `./scripts/run.mjs check-diff`. Scope E2E drives real `command` RPC strings through the registry/parser/owner/store, reloads persisted entries, and verifies missing creation is side-effect-free. Launch a real parsed profile containing system schedule strings and ordinary entries, then assert only its tab schedules were installed. Browser creation dialog is delivered in 15.

## Boundaries

This plan owns schedule grammar and its complete command routing. It adds no `execute`/edit fallback, completion catalog, schedules-row UI, or dialog. The parser remains pure, and system membership is not encoded as `target: 'system'` on a tab entry.
