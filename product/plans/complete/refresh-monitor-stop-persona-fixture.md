# Refresh the monitor stop test fixture to the delivered Persona shape

**Complexity: 1/10** — test-fixture-only edit with no production files and no added lines, 4 acceptance requirements and no new scenarios or units (p=2.71).

## Goal

The `makeMonitor` fixture in `src/monitor/stop.test.ts` still builds a `persona` with the removed `harness` and `tools` fields and no `role`, relying on test files being excluded from typechecking to keep the stale shape silent. `Persona` is now `{ name, role, body }`, and sibling monitor tests already use that shape. The goal is to refresh that one fixture so it encodes the shape the code actually delivers, so a future test that reads `persona.role` from a stopped monitor gets a real value instead of `undefined` and a confusing runtime failure.

## Requirements

1. The `persona` object inside `makeMonitor` is `{ name: 'reviewer', role: 'ask', body: '' }`. From the entry Proposal: "change the `persona` object inside `makeMonitor` from the old harness/tools form to `{ name: 'reviewer', role: 'ask', body: '' }`".
2. The `satisfies MonitorSub` annotation on the fixture stays in place. From the entry Proposal: "and keep the `satisfies MonitorSub` annotation."
3. No production file changes. From the entry Proposal: "No production file changes".
4. The `stop` and `closeIfUnfed` tests in that file keep passing untouched. From the entry Proposal: "the stop and closeIfUnfed tests in that file must keep passing untouched."

## Design decisions

- Edit only the test fixture; no production source, spec, help page, or documentation file changes.
- Keep `satisfies MonitorSub` so the fixture remains checked against the current `MonitorSub` and `Persona` shapes.
- Use `role: 'ask'`, matching the delivered `reviewer` persona shape already used in sibling monitor tests rather than inventing a new value.
- Restore the pull request backlog to its exact master comment-and-heading skeleton, because this is its sole remaining entry.
- Leave pull request 2185 open; never merge, close, or replace it.

## Preserved behavior

1. `stopMonitor` releases every resource on a full stop or last-target removal and must not leave the timer running, the subscriptions live, or the reporting tab open — pinned by the "releases every resource on a full stop or last-target removal" test in `src/monitor/stop.test.ts`.
2. `closeIfUnfed` closes a reporting tab whose monitor has no registrations and must not close one that still has a non-inline, externally owned registration — pinned by the "checks external runtime-name ownership" test in `src/monitor/stop.test.ts`.

## Assumptions

1. `Persona` is `{ name: string; role: string; body: string }` — `src/personas.ts:13` (`export type Persona = {`).
2. `MonitorSub.persona` is typed `Persona` — `src/monitor/live-monitors.ts:26` (`persona: Persona;`).
3. The stale fixture is the `persona` line in `makeMonitor` at `src/monitor/stop.test.ts:17`, and sibling tests already use the `{ name, role, body }` shape — `src/monitor/ask.test.ts:22` (`persona: { name: 'test-persona', role: 'tell', body: 'Watch for bugs.' }`).
4. This is the only entry in `./product/backlog/pull-request.md`, so removing it drains the file to the empty skeleton.

## Existing functionality

1. The `MonitorSub` type and its `satisfies` check in the fixture constrain the shape — `src/monitor/live-monitors.ts:19` (`export type MonitorSub = {`) and `src/monitor/stop.test.ts:24` (`} satisfies MonitorSub;`).
2. The delivered persona shape used by sibling monitor fixtures provides the replacement to mirror — `src/monitor/ask.test.ts:22`.
3. `$janissary/scripts/run.mjs check-diff` supplies lint, incremental typecheck, and the affected server tests as the verification gate.

## Implementation steps

1. Record this fix plan under `./product/plans/` (draft, then rated, then ready, then complete); no application implementation is involved, only the fixture edit. Build command after this step: `$janissary/scripts/run.mjs check-diff`.
2. In `src/monitor/stop.test.ts`, replace the `persona` object in `makeMonitor` with `{ name: 'reviewer', role: 'ask', body: '' }`, removing the `harness` and `tools` fields and adding `role`, while leaving the `satisfies MonitorSub` annotation intact. Do not touch any test case. Build command after this step: `$janissary/scripts/run.mjs check-diff` — confirm the `stopMonitor` and `closeIfUnfed` suites pass unchanged.
3. Remove the resolved entry whole from `./product/backlog/pull-request.md`, from its lead `*` bullet through its `Proposal` paragraph and separating blank lines, and restore the file to the exact master comment-and-heading skeleton. Build command after this step: `$janissary/scripts/run.mjs check-diff`.
4. Commit the fixture edit, plan, and backlog change to the recorded head branch with `$janissary/scripts/run.mjs pr-commit` and push with `git push`, leaving the pull request open.
5. Confirm the pull request is still OPEN and its `headRefOid` equals `git rev-parse HEAD` with `gh pr view <reference> --json state,headRefName,headRefOid,url`.

## UI design

None. This is a test fixture correction; it changes no command, flag, key binding, or user interface.

## Tests

No new tests. The change corrects a test fixture without altering application behavior or introducing production code. The existing `stopMonitor` and `closeIfUnfed` cases in `src/monitor/stop.test.ts` are the coverage and must keep passing untouched; `$janissary/scripts/run.mjs check-diff` runs them plus the incremental typecheck that validates the fixture against `MonitorSub`.

## Out of scope

- Any production source file change.
- Any product spec, help page, or user/developer documentation edit.
- Adding, rewriting, or removing any test case other than the fixture object.
- Changing the pull request title or description.
- Merging, closing, or replacing pull request 2185.

## Verification

`$janissary/scripts/run.mjs check-diff` first — expected to pass lint, incremental typecheck, and the affected server tests with no failures.

Then concrete read-based checks: read `src/monitor/stop.test.ts` and confirm the `makeMonitor` fixture's `persona` is exactly `{ name: 'reviewer', role: 'ask', body: '' }`, that no `harness` or `tools` field remains anywhere in the fixture, and that the `satisfies MonitorSub` annotation is still present; read `./product/backlog/pull-request.md` and confirm it contains only the leading comment and `# pull-request` heading; read this plan in `./product/plans/complete/`; and run `gh pr view <reference> --json state,headRefName,headRefOid,url` to confirm state OPEN with a `headRefOid` equal to `git rev-parse HEAD`.
