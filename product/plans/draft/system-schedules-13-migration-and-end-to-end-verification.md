# System schedules 13: migration and end-to-end feature verification

**Complexity: 5/10**

This delivers repeatable cross-process/browser evidence and upgrade regression coverage over completed contracts. It does not introduce another scheduler or defer unplanned feature implementation into the verification step.

## Goal

Verify the complete delivered feature across process restart, real shell/client draining, commands, plugin actions, profiles and configuration upgrades. Close the integration promise of `product/plans/ready/add-system-schedules.md` explicitly rather than leaving a final cleanup implied.

## Decisions and dependencies

- Dependencies: all of 01–12 completed, published and focused-reviewed. This plan adds cross-feature integration tests, repeatable E2E drivers/fixtures, and documentation reconciliation within the delivered contracts. A newly discovered behavior change requires its own improved/published repair scope, not an unbounded source rewrite here.
- Migration is additive: no system schedule file means empty state; schema v1 is validated; unsupported/corrupt stores are preserved and never executed; old configs default the new explicit event on; old profiles retain tab-only schedule semantics; old queue/plugin capabilities still work. Every startup creates fresh local tabs/queues/tab timers and hides the new system shell. Project entries/scripts survive the unconditional clear. Parked remote sessions still reattach on every launch, independently of project schedules.
- Use one application startup/restart path on master `d21c4211`, not a two-mode launch matrix. The removed `--relaunch` option remains an unknown-option error covered by `src/cli-args.test.ts`; `product/specs/relaunch.md` and `scripts/janus-launcher-relaunch.test.mjs` are deleted. Source-plan historical flag references mean stop/start with ordinary `janus`. Existing profile relaunch and remote naming retry behavior are still tested under those names.
- Use a workspace-built server and a scratch target directory, the real launcher `node bin/janus.mjs --no-open <scratch-project>`, and the attached browser via `scripts/e2e/session.mjs`. One connection per batch remains open from first to last interaction. Never drive the user's live instance or launch/install another browser. Disable only inner workspace sandboxing when already confined, as the browser guide requires.
- Store test scripts/snapshots under scratch projects. Fixtures may seed already-overdue timestamps while the app is stopped; never hand-edit an owner's live persisted file to simulate due events. Keep secrets/tokens out of evidence, fixtures and committed files. Use deterministic stub harness binaries where provider access would otherwise be required, but real PTY/tab/naming/queue paths.
- Capture failing and passing evidence once, with clear assertions and cleanup. The launcher truncates `.janissary/log/server.log` on every launch, so capture each stopped process's sanitized evidence before starting the next, then read that next launch's fresh URL rather than tailing an assumed append-only log. Per-run shell transcripts/recordings are also cleared; assert first-run output before restart and assert newly produced output afterward. Missing attached-browser variables are a concrete E2E blocker to report; unit tests alone are not a claimed browser pass.

## Existing code to reuse

`scripts/e2e-driver.mjs`, `scripts/e2e/{session,fixtures,inspect}.mjs`, `src/{http-test-fixture,websocket-test-fixture}.ts`, the public launcher and command RPC, existing schedule/plugin fixtures, and 01–12's service-level integration tests. Keep assertions behavioral: disk contents, output order, visible tab lists, notifications, and live process identity.

## File scope

- New `scripts/e2e/system-schedules-{execution,restart,management}.mjs` drivers plus `scripts/e2e/system-schedules-fixtures.mjs` and its colocated `.test.mjs` if the helper contains meaningful validation/cleanup logic. Add a driver composition/helper only if needed to keep each production script below 200 lint-counted lines. Existing runner/session helpers may gain additive fixture support only when required by these drivers.
- New `src/schedule/system/{restart.integration,legacy-state.integration,contracts.integration}.test.ts`; new `src/plugins/schedules/system.integration.test.ts` and `web/src/plugins/shell/system-queue.integration.test.tsx` only for cross-layer gaps not already covered. Reuse earlier fixtures instead of mirroring implementations or duplicating all unit tests.
- Behavior fixes are limited to the exact owner/startup/transport/plugin/dialog seams already named in 01–12, and only after an improved plan explicitly names the discovered repair and concrete files. Do not silently expand this test plan into a new implementation tranche.
- Regression references: existing `src/{index,launch-shell,cli-args}.test.ts`, `src/state/dirs.test.ts`, `src/sessions/{manager,shell-roundtrip,harness-roundtrip}.test.ts`, and `scripts/read-log-since.test.mjs`. Reuse these current seams and add only missing cross-feature coverage in the files above. No launcher/CLI source changes or replacement flag-specific suite are required.
- Specs/docs reconciliation: `product/specs/{scheduling,notifications,tabs,profiles,state-directory,command-queue,shell-tab,editor-tab,cli,application-state,application-config,tab-plugins}.md`; `help.md`; `documentation/user-documentation/automation/{scheduling,profiles}.md`, `documentation/user-documentation/command-bar/{shell,commands,queue}.md`, `documentation/user-documentation/getting-started/{startup,tabs}.md`, `documentation/user-documentation/tab-types/{editor,notifications}.md`; `documentation/developer-documentation/tab-plugins.md` contract reference/changelog. Read current `product/specs/{sessions-tab,remote-server}.md` to preserve automatic restoration. Earlier subplans update docs alongside behavior; this plan checks cross-references, stale owner/tab claims and examples. Canonical source-plan promotion/consolidation remains the orchestrator's later step.

## Ordered changes

1. Add the minimal repeatable scratch fixtures and drivers for execution, restart, and management. Build the current server/web bundle and connect through the provided browser client, recording console errors and useful screenshots/text.
2. Run the execution scenario: create `.janissary/scripts/morning-checks.rs` with a comment, blank line, `pwd`, `false`, a failing application command, and a deliberately authored `notify` after the failures. Create a near-term system entry, observe its aggregate next-run row, keep system hidden and confirm FIFO completion. Reveal, inspect terminal/shell transcript and command replies in their ordinary respective surfaces, hide, reveal again. A failed line must not stop later lines or produce an automatic error notice. A foreground editor/program must pause until exited.
3. Run restart/migration scenarios below through repeated ordinary launcher starts against the same scratch project. Keep/reopen a browser client for each run and wait for clean shutdown/write completion between processes. Cover empty and seeded parked-session stores through the existing deterministic attach seam; a live remote-peer browser result is only claimed when a peer is actually available.
4. Run management/dialog/profile/name-clash/close matrix below. Drive commands and actual plugin intents/UI, not only service calls. Verify cleanup of real PTYs and test-server process on quit.
5. Reconcile final specs/help/reference against observed behavior, including the explicit missing-edit refusal. Run diff-scoped checks and the targeted integration drivers, recording exact outcomes and blockers.

## Required integration and E2E matrix

| Area | Assertions |
| --- | --- |
| Persistence | Future one-shot and recurring entries survive repeated ordinary starts; scripts remain; local tabs/queues/receipts are fresh; one managed system starts hidden beside focused `janus` before any restored remote tabs arrive; schedule file is ignored by git and untouched by unconditional clear. Per-run artifacts are cleared and `server.log` holds the new launch only. |
| Startup regression | Every launch independently attempts each eligible parked remote session; empty store, surviving remote shell/harness, unreachable/refusing peer and legacy agent-only records retain existing semantics. Nonfatal system spawn/store failure does not suppress remote restore, and remote arrival never duplicates/adopts the managed shell or restores a local queue. |
| Missed | Seed a past one-shot and past interval/daily/weekday recurring entry while stopped; each reports one missed event and enqueues nothing; one-shot disappears, recurring advances strictly into the future and persists; no catch-up replay. |
| Missing script | Creation refuses and names the file; deleting after creation reports the exact missing message at firing, removes a one-shot, retains/reschedules a recurring entry, and recovers next time after restoring the script. |
| File edits | `execute` and the next firing read edited contents; existing exact file wins over runscript edit fallback; missing edit/execute creates no file/directory/editor; dialog only lists existing valid names. |
| Notices | Firing/missed/missing/startup failure share default-on toggle and correct system attribution; toggle off silences all four; active system still receives enabled explicit events; link reveals; no per-line error event. Existing shell ambient notices remain as configured. |
| Shell availability | Refuse only the system spawn while allowing `janus`; app still connects and records failure; next execute/firing retries; actual process exit hides/replaces the system PTY and ends its tab timers without losing project schedules; shutdown/disable never resurrects it. |
| Lifecycle | `close`, `exit`, named close, strip ×, Cmd+W, Ctrl+W and actual terminal `exit` all hide rather than destroy system, restore focus and keep drain usable; split/docked variants do not leave hidden selected panes. Last visible non-docked user tab close quits even with hidden or revealed system present. |
| Navigation | Strip, next, Shift+arrows and `nav` omit hidden system; `tab focus` by label/alias and notification/schedule links reveal; command miss/reserved-name strings match the source. |
| Ownership | `schedule ... in system` is an ordinary tab timer; its lifetime differs from project entries; system entries never appear in per-tab schedule windows. Closing another tab never removes project entries. |
| Duplicates and actions | Repeat system names coexist; command cancel removes all name matches; UI Delete removes one opaque key; matching system tab timer is unaffected; full/docked row focus reveals; Clear all removes both owners and no scripts, including after restart. |
| Dialog | Every form builds the system script grammar; hidden/managed system is not a tab choice; ordinary target behavior and remembered fields remain; empty/deleted script choice cannot create a schedule. |
| Profiles | Save excludes system and all project schedules even when revealed/aliased/reordered; relaunch doesn't destroy managed system; authored system schedule lines are reported/skipped; ordinary `run`/schedule lines and typed/profile clash refusal remain. |
| Harness naming | A real scheduled run with explicit clashing base chooses smallest free `-N`; context survives hidden client dispatch and remote retry; typed-in-system, manual execute, ordinary queue, tab timer, and profile launch retain refusal. |
| Compatibility | Missing/old config defaults on; explicit false retained; corrupt/future store safe; old string queue API and old tab topic actions round-trip; frozen plugin fixtures unchanged; schema literals/guards agree and lazy chunks stay separate. |

## Source-plan coverage and shared ownership

Each row names the primary delivery plan and the explicit integration/test partners. Implement 01–13 in filename order; every dependency listed in those plans points backward. Their ratings remain 6, 3, 6, 5, 6, 5, 4, 6, 4, 5, 6, 4 and 5 respectively, all below 7. The original source remains 7/10.

| Source requirement | Delivery and integration |
| --- | --- |
| Hidden flag, retained body, canonical indices, strip/next/nav omission, focus by label/alias/link | 01; 03/06 maintain the actual shell consumer; 11 adds row focus. |
| Every close path hides, focus repairs, last-user-tab quit, reserved system name, destructive shutdown/disable | 01; 03 handles actual PTY exit/replacement and terminal generation checks. |
| New project-root zsh on every startup, nonfatal failure/retry, no workspace, profiles exclude system | 03; 08 sequences owner load/tick; 09 skips authored project schedule lines. |
| `.rs` names, one line per command, comment/blank filtering, reread, ordinary shell authority | 04; 06 preserves shell behavior; 08/10 consume files at each run. |
| Versioned atomic project store, launch-clear retention, never ordinary Git staging | 04; 08 owns persisted mutations and disposal; 13 proves restart behavior. |
| Same server queue/client FIFO, externally appended wake, no drawn terminal, idle/foreground wait | 05/06; 03 retains the one mount; 08/10 append whole batches. |
| Errors/output match shell, continue after failures, no automatic per-line notices/timeouts | 06; 02 adds schedule events only; 13 verifies real shell/application failures. |
| Five system forms, script-only creation, list/cancel-all-name/clear, duplicate names, exact messages | 09 over 04/08; tab grammar and `in system` remain ordinary tab ownership. |
| Boot missed one-shot removal/recurring advance, no catch-up; deleted script behavior; live firing | 08 over 02/04; 13 verifies stopped-process timestamps and rereads. |
| Firing/missed/missing/startup notices, default-on explicit toggle, attribution/reveal link | 02 defines messages/config; 03 emits startup failure; 08 emits schedule outcomes; 13 verifies delivery. |
| Top-level execute, existing-file-first edit fallback, no missing-script creation, completion | 10 over 04/08/09; 01 owns `tab focus`; 13 checks command integration. |
| Scheduled harness smallest free postfix only, unchanged typed/profile refusal, recurring system launches | 05/06 carry provenance; 07 interprets it; 08 produces it; 10/13 compare manual/scheduled paths. |
| Mixed aggregate rows, stable duplicate keys, delete one/focus/clear both owners, no per-tab system rows | 11 over 08/09 and 01/03; 13 verifies full/docked/restart actions. |
| Dialog system choice, hidden-shell exclusion, existing-script picker, no files created | 12 over 04/08/09/11; 13 verifies live dialog and stale selection. |
| Specs/help/reference updates, migration, integration, browser evidence and preserved exclusions | Each delivery plan updates its named docs/tests; 13 checks the complete matrix. |

## Verification

Run `./scripts/run.mjs check-diff` after each change. Use `npm run build:server` and `npm run build:web` for the actual built app and inspect shell/schedules chunks. Run each driver with `./scripts/run.mjs e2e-driver scripts/e2e/system-schedules-<scenario>.mjs --log <scratch-project>/.janissary/log/server.log --scratch ./temp/system-schedules-e2e --out <scenario>`. Use a fresh server instance per runner connection; restart checks can relaunch inside one controlled batch while retaining its browser connection. The helper reads the new session URL from the new server's own log and never records tokens. Run named server/client integration tests and frozen compatibility tests when diff selection doesn't include them. Do not run `npm run check`.

## Boundaries and completion evidence

No closed-app execution, missed replay, server-side drain, multiline script parser, timeout, stop-on-error, per-line error notices, schedule editing, script-creation dialog, terminal creation dialog, new plugin loading route, dependency update, or typed/profile suffix policy. Record scenario pass/fail evidence, tests/builds, spec changes and concrete blockers in the implementation report. Keep the canonical 7/10 source plan intact for orchestrator consolidation after all focused reviews.
