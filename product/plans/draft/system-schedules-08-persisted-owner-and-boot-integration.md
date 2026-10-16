# System schedules 08: persisted project owner and startup firing lifecycle

**Complexity: 6/10**

This is the persisted owner's timing/commit state machine and startup/disposal integration. It reuses completed shell, store, notice and provenance contracts; grammar, aggregate actions and dialog delivery follow separately.

## Goal

Implement the project-owned schedule manager, load it before firing begins, and append each due runscript to the managed shell FIFO. Source: `product/plans/ready/add-system-schedules.md`.

## Decisions and dependencies

- Dependencies: 02, 03, 04, 05, 06 and 07 for notices, ensure/recovery, store/reader, provenance transport, and harness interpretation. Commands and UI can follow; tests invoke the public owner API. All inherit 01's managed identity and current-master startup baseline.
- Register `managers.systemSchedule` independently of the tab-keyed `ScheduleManager`; do not add it to `MANAGER_TAB_RELEASE`. Public operations are load/startup recovery, list, add, cancel-by-name (all matches), cancel-by-key (one row), clear, tick(now), and dispose. Mutations atomically save before publishing state/acknowledging success.
- Keep `ScheduleManager`'s existing single one-second timer. Add a due-owner hook to that tick, with a single-flight guard for async ensure/read work so a slow firing cannot enqueue twice. No second interval, recursive catch-up, or source command dispatcher for expanded lines.
- Load/recover before this loop starts. `createController` currently starts the schedule timer before `openLaunchShell`; move startup sequencing deliberately so the production path opens `janus`/system, loads and reports missed system entries, then starts firing. Preserve direct-controller test semantics through an explicit initialized start seam and migrate all actual callers/tests in this change. Keep `startServer`'s unconditional, non-awaited remote-session reattach after local shell startup and before serving clients; it must not wait for peer reachability or become conditional on system-shell/store success. Failed launch-shell startup still aborts and disposes without starting either firing or remote restore.
- At boot, an entry due at/before startup time is missed, never enqueued. Capture that cutoff once per startup, before async shell preparation, so slow startup cannot change a missed run into a live run or vice versa. Post one missed notice per entry, remove one-shots, and advance recurring entries to a strictly future run using `computeNextRun`. Do not replay every missed occurrence. This applies to first launch and every ordinary restart. Live-process sleep/wake runs a due system entry once through the queue, then advances from now; it is not an app-closed miss.
- At firing, read the current script, ensure the shell, and append the full filtered line list in order to its existing runtime queue with 05 provenance. Concurrent due runs/execute calls append as whole FIFO batches so their lines do not interleave. A firing notice means enqueued, not completed. Do not wait for shell success or emit per-line errors/notices.
- Stage the next owner snapshot after asynchronous preparation, atomically save it, then append the batch and emit the existing broadcasts synchronously in that serialized operation. Revalidate that its keyed entry is still current after each await: a concurrent cancel/clear must not be undone by a stale prepared snapshot or enqueue cancelled work. A persistence failure enqueues nothing and leaves the due entry unchanged, so retry cannot duplicate an already appended batch. This does not promise replay or exactly-once execution after an abrupt process crash; queues intentionally aren't durable.
- Deleted script: emit the missing-file notice with the exact project-relative script file, remove one-shot, and reschedule recurring. Shell-start refusal: emit the 02 failure notice, leave the due entry unchanged for the next firing attempt; `execute` likewise tries again on its next invocation. Avoid duplicate reports from the startup helper and firing caller for one failure attempt.
- Use synchronous atomic persistence for mutation commits. Keep add/cancel/clear results synchronous so the existing synchronous `clearAll`/`topicAction` callers in 11 can surface a store failure as a domain rejection; serialize async firing/run-now preparations and their batch appends, revalidating against intervening committed mutations. `dispose()` stops new work, waits for in-flight preparation, and prevents an awaited ensure from enqueueing after shutdown. There is no buffered write to flush. Stop the scheduler before disposing the system owner. Queued lines are never saved.

## Existing code to reuse

`ScheduleEntry`, `computeNextRun`, schedule display/time math, 04 store/reader, 03 ensure service, 02 notices, and the 05 tab queue append seam. Existing `schedules: changed` and `state: dirty` broadcasts are the low-frequency integration signals. Tab ownership and its due-delivery budgets/hooks remain in `ScheduleManager`.

## File scope

- New `src/schedule/system/{owner,fire,startup,mutations}.ts` (extract only cohesive responsibilities actually needed); `src/{managers,controller,index}.ts`, `src/controller/create-managers.ts`, `src/schedule/manager.ts`, `src/system-shell.ts`, queue batch helper in `src/tab/{queue,queue-state,queue-commands}.ts` or new `src/command-queue/append-run.ts`.
- Anticipated extracts from `ScheduleManager`: `src/schedule/{tab-firing,entry-hooks}.ts` for existing behavior if the new hook breaches the line limit. Move actual importer references, preserving hooked auto-resume and per-harness one-entry delivery behavior. New manager test fixtures may be extracted into `src/schedule/system/test-fixture.ts`.
- Tests: new colocated system owner/fire/startup/mutations tests and `owner.integration.test.ts`; existing `src/{managers,controller,index,launch-shell}.test.ts`, `src/schedule/manager.test.ts`, `src/controller/create-managers.test.ts`, `src/sessions/{manager,shell-roundtrip,harness-roundtrip}.test.ts`, and the queue-state tests introduced in 05. Update direct `createController` callers/test fixtures identified by callsite search. Shutdown, failed-start cleanup and unconditional remote-restore regression belong in this scope; use a deterministic attach boundary rather than requiring a reachable peer.
- Specs: `product/specs/{scheduling,state-directory,command-queue,cli,application-state}.md`. Current `sessions-tab.md` and `remote-server.md` describe the unchanged automatic reattach behavior. `src/main.ts`'s no-argument clear and current `ServerOptions` are read-only baseline references, not launch-mode plumbing to restore.

## Ordered changes

1. Implement stateful owner/mutations over validated 04 storage, unique keys and reused time math; expose deterministic `tick(now)` and startup recovery for tests.
2. Implement batch reading/ensure/enqueue outcomes, one-shot removal and recurrence advancement. Separate boot missed handling from live due processing. Announce each persisted change through existing signals.
3. Register construction/disposal and wire the single schedule tick. Stop ticking before flushing owner work; keep project schedules untouched by tab hide/close/plugin teardown.
4. Reorder production startup so load/recovery completes before timer start; update every direct-controller startup caller and relevant fixtures. Handle nonfatal corrupt store and system-shell start errors without aborting `janus` startup. Report store-load/unsupported-version diagnostics through the existing boot warning channel; do not invent an additional schedule notification type.
5. Test live firing, boot recovery, persistence failures, races and shutdown; update specs in this implementation.

## Tests and verification

Cover queue append/order, multiple due entries with repeated names, no duplicated dispatch during slow reads/ensure, empty script, reread after edit, one-shot/interval/daily/weekday advancement, exact-at-startup missed boundary, long-closed recurring skip once, missing files, shell failure then recovery, atomic-write failure, cancel/clear persistence and races with prepared runs, tab closure independence, sleep/wake once, and disposal racing a firing. Pin unchanged tab scheduler hooks, remote/harness readiness, one-harness-entry-per-tick budget, and lateness notices. Assert remote reattach is invoked once per startup even when the nonfatal system spawn/store load fails, without making the scheduler wait for remote responses.

Run `./scripts/run.mjs check-diff`. Scope E2E creates a real scratch store/script, launches a real server with connected client consumer, fires a near-term entry, observes output and notice while hidden, shuts down, constructs a fresh server against that same project, and verifies persisted future entries plus a missed one-shot/recurring entry. Use deterministic time at the owner seam for overdue scenarios instead of waiting hours. The final user-command/browser matrix is 13.

## Boundaries

No command grammar or UI. Do not migrate memory-only tab schedules into project storage, persist tabs/queues, run closed-app work, stop on line errors, or add a drain timeout. 11 later merges aggregate views and clear-all; this plan exposes the owner operations it needs.
