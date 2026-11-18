# Settle remote readiness when termination arrives during a pending clone

**Complexity: 2/10** — 1 added production line, 1 existing file, 4 requirements, 4 scenarios, no new units (p=3.76).

## Goal

A remote subagent run terminated while its clone creation is still pending must still publish exactly one terminal completion. Readiness settles promptly as cancelled, a later successful clone cannot become readiness or reach task lookup, and the run's allocation, clone release and lease all drain normally.

## Approach

`release()` is one-shot and is reached from both the run's `remote-clone-provision` resource cleanup and `releaseWorkspace` when a run terminates. `doRelease()` already sets `cancelled` there but never settles readiness. Add one `rejectReady(new Error('git clone cancelled.'))` call at the top of `doRelease()`, directly after `cancelled = true`. The existing `settled` latch makes it a no-op when readiness already resolved (normal completion) or when `cancel()` already rejected it (the existing late-success-cancel path), so neither changes. `startup()` keeps its `ended(run)` guard after the awaited `create`, so a directory returned after termination is ignored; `resolveReady` is latched too, so a late success cannot win. No new module, latch or state is introduced, and allocation still ends when the create request is submitted, before readiness settles.

## Implementation steps

1. In `src/subagent/remote-workspace.ts`, call `rejectReady(new Error('git clone cancelled.'))` at the start of `doRelease()`, immediately after `cancelled = true`. Leave `cancel()`, `release()`, the `ended(run)` guard after `await create`, and all allocation/lease ordering untouched. Run `$janissary/scripts/run.mjs check-diff`.
2. Add the workspace regression case (see Tests) to `src/subagent/remote-workspace.test.ts` using the real run/lease/channel fixtures so allocation is genuinely pending when termination arrives. Run `$janissary/scripts/run.mjs check-diff`.
3. Add the launch/settlement case (see Tests) to `src/subagent/launch.test.ts`. Run `$janissary/scripts/run.mjs check-diff`.
4. Add one concise sentence to the "Remote clone lifecycle" section of `product/specs/subagent.md`: termination recorded while a pending clone is outstanding rejects readiness as cancelled and still yields exactly one terminal completion, while a later successful clone is ignored.

## Tests

- `src/subagent/remote-workspace.test.ts`: with `autoCreate = false`, start the run and confirm the pending `create` request, begin `finish(run.id, 'terminated')`, flush so release records cancellation, then answer the create with a successful directory. Assert `workspace.ready` rejects with `git clone cancelled.`, no task lookup begins, and the clone release and lease drop each happen once.
- `src/subagent/launch.test.ts`: with a pending remote create, launch, terminate the run, then answer the create with a successful directory. Assert no task lookup and no executor start, and exactly one completion reply whose output is `Subagent terminated.`
- Keep the existing `cancel()` late-success, one-shot release and execution-barrier cases unchanged as regression coverage.

## Out of scope

- Changing `cancel()`, the `ended(run)` guard, the readiness latch, or allocation/lease ordering.
- Changes to local workspace provisioning, the remote protocol, or the workspace/lease managers.
- New documentation beyond the clarified spec sentence: no public flag or command behavior changes, so no help or user-documentation update is needed.
