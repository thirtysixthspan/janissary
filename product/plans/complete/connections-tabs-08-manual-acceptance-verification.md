# Connections manual acceptance verification

**Complexity: 2/10** — verification and evidence recording only. No production, test, spec, documentation, or PR-description change; the work exercises the already-completed connections feature in an isolated scratch project and records what the assigned browser actually showed.

## Goal

Complete the manual acceptance ledger in `product/plans/complete/connections-tabs-07-specs-docs-integration.md` for the connections feature on PR #1916. Record per-scenario observed results, evidence paths, unavailable resources, the current production chunk names, and the static import closure, without substituting unit, frame, or stub tests for browser or real-host checks.

## Environment

- Head under test: `37324fd4` on `feature/connections-tabs`.
- Server: built from this workspace with `npm run build`; the server was started with `node bin/janus.mjs --no-open <scratch-project>` and driven through the assigned browser via the e2e driver.
- Scratch project: `temp/acceptance-07/work`, a local git repository with harmless task files and notes, its own `.janissary/` state, and a local bare origin for agent workspace clones. Scratch HOME: `temp/acceptance-07/home`.
- Provider: OpenCode `google/gemini-3.5-flash-lite` through `OPENCODE_API_KEY`/`GEMINI_API_KEY` as available. `google/gemini-2.5-flash-lite` hit its free-tier 20-request daily quota during M3.
- Nested sandbox: `sandboxWorkspaces` was set to `false` in the scratch project's `.janissary/config.json` because the workspace is already inside a Seatbelt sandbox and nested `sandbox-exec` fails; this follows `ai/guidelines/sandbox-e2e-browser.md`.
- Evidence: `temp/acceptance-07/` contains the driver records and screenshots. Nothing under `temp/` is committed.

## Scenarios

| Scenario | Result | Evidence |
| --- | --- | --- |
| M1 asynchronous shell | Partial. Pending question-held `acp`, `ls` overlap, exact one-line refusal, single rendered answer at the bottom after intervening output, and replay without duplication observed. Monitor `monitor` heading not exercised. | `temp/acceptance-07/m1-m4.json`, `m1-question-pending.png`, `m1-overlap.png`, `m1-settled.png` |
| M2 navigation/list/actions | Partial; exercised items passed. Centre/list docking and return, singular/plural grammar, popup ACP row, UUID/title/lowercase/miss lookup, keyboard movement, two-click opening, mixed rows, exact `global` SQLite row, focus and app-wide close, live-row and command notifications. Unattributed SQLite no-op and stale-owner guards not exercised. | `temp/acceptance-07/m2-m8.json`, `m2-followup.json`, `m2-live.json`, `m2-popup.json`, `m2-left.png`, `m2-right.png`, `m2-centre.png`, `m2-completion-acp.png` |
| M3 record content/history | Partial. Seeded 21-block record verified newest-20 window, older-block paging with viewport preservation, ordered prompts, all five activity kinds, collapsed thought/tool, rendered answers, no prompt input. Provider stream follow not observed; provider records showed message/thought/tool only. | `temp/acceptance-07/m3-seeded.json`, `m3-seeded-initial.png`, `m3-seeded-paged.png`, `m4.json`, `agent-probe-3.json` |
| M4 cancel/close/questions | Partial. Cancel of a question-held prompt, one `ACP: prompt cancelled.`, reset confirmations, record Close session, command close notification, and docked left/right questions observed. Running-during-drain, unrelated-question cancellation, hidden docked body, and centre question not conclusively exercised. | `temp/acceptance-07/m4.json`, `m4-questions.json`, `m4-question-pending.png`, `m4-cancel-settled.png`, `m4-reset.png`, `m4-closed.png`, `m4-command-close.png` |
| M5 agents/snapshots/non-tracked consumers | Partial. Headed/headless agent records, Completed/Failed/Terminated distinction, caller popup row without snapshot, row disappearance, monitor-close independence, and record Terminate observed. Terminate disabled state and editor persona/monitor snapshot surfaces not exercised. | `temp/acceptance-07/m5b.json`, `m5-launch.png`, `m5-popup.png`, `m5-monitor-closed.png`, `m5-terminated.png`, `agent-probe-3.json` |
| M6 persistence/recovery/deletion | Passed for exercised items. Clean restart, read-only closed record, delete confirmation with Cancel no-op and confirmed file/row/tab removal, and startup recovery of seeded open records observed. 30-day boundary and retention failure stay with the isolated tests. | `temp/acceptance-07/m6-delete.json`, `m6-crash.json`, `m6-delete-confirm.png`, `m6-crash-rows.png` |
| M7 real remote cancellation | Blocked. No reachable SSH host running remote protocol 37 and no authenticated remote provider. `localhost` refused public-key/password auth; `devbox` did not resolve. No frame/unit test is counted. | Command output recorded in the 07 ledger |
| M8 legacy output/help/completion | Passed for exercised items. `connections list` live-only output, matching row/command notifications, ACP and SQLite completion, singular no-completion, and help pages with multiword title examples and exact `global` wording observed. Delayed browser-close reporting and every help cross-link not separately exercised. | `temp/acceptance-07/m2-m8.json`, `m2-live.json`, `m2-popup.json`, `m2-completion-sqlite.png`, `m2-help.png` |

## Build assertions

`npm run build:web -- --manifest --sourcemap` passed at `37324fd4`.

- Eager entry: `assets/index-lXyC7AjQ.js`.
- Entry static closure: `_jsx-runtime-BA9wYCQY.js` only.
- Connections dynamic entry: `assets/connections-BYqtxYy5.js` with `assets/connections-D-FwGdwy.css` and shared CSS.
- Shell dynamic entry: `assets/shell-BgbHcVF5.js` with `assets/shell-Dvv_bZYX.css` and shared CSS.
- `web/dist/.vite/manifest.json` lists both plugins under the entry's `dynamicImports`.
- Connection list/record/history/activity class markers are absent from the eager JS and CSS; no fixture or removed-panel identifier was found.

The chunk hashes differ from the earlier `5fa9845` build record. That is a build-content hash difference, not a production change; the static-closure result is unchanged.

## Missing resources and limits

- No SSH host running remote protocol 37 and no authenticated remote provider, so M7 is blocked and the feature is not fully manually verified.
- `google/gemini-2.5-flash-lite` exhausted its free-tier daily quota after 20 requests. M3 paging/history used a seeded scratch record; active provider stream follow was not observed.
- The cancellation drain completed faster than the first 400 ms poll, so Running-during-drain is not claimed.
- The Terminate button disappeared before its disabled state could be sampled.
- Editor persona/monitor snapshot surfaces and shell/harness transcript-file controls were not exercised.
- The 30-day retention boundary and retention-failure cases remain assigned to the existing isolated store/manager tests, per the 07 plan; no manual 30-day wait was claimed.

## Out of scope

- Production code, tests, specs, documentation, help, PR title, and PR description changes.
- Reopening any completed subplan or changing historical plans other than the 07 verification ledger.
- Merging or closing PR #1916.
- Committing generated screenshots or any other file under `temp/`.
