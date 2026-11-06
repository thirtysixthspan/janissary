# ACP prompt isolation and role orchestration

**Complexity: 5/10** — concurrent role prompts need independent reservation, cancellation, model fallback, transcript-entry identity, and tab-busy settlement across the ACP and transcript paths.

## Goal

Allow one ask prompt and one tell prompt to run independently on the same tab, using separate sessions, histories, model fallback, cancellation, and records, while each stream updates only its own transcript entries.

## Decisions and dependencies

- Depends on the completed `product/plans/complete/role-keyed-acp-session-state.md` and `product/plans/complete/role-based-acp-tool-filtering.md`. Preserve the role-keyed sessions, prompt state, records, and per-prompt role settings those plans established.
- Add role as the final optional argument, defaulting to `ask`, on the existing `AcpManager.start`, `prompt`, `promptResult`, `run`, and `cancel` calls; the existing plugin capability wrappers remain ask callers. The manager's role-aware `close` remains the reset operation for this step; the public `tell reset` command is introduced later.
- `run` strips only the selected role's leading command word before sending the prompt to its model: `ask` strips `ask`, and `tell` strips `tell`. An empty prompt uses the matching `Usage: ask <prompt>.` or `Usage: tell <prompt>.` line. A prompt is refused with `ACP: a prompt is already running.` only when that same role already has a pending prompt; check `existingAcpRoleRuntime(runtime, role)?.prompt` for this reservation, not the all-role helper. Ask and tell may run concurrently; each role still has at most one pending prompt.
- Keep model selection and grants as a fresh named-role snapshot for each prompt. An absent role uses its built-in entries and grants; an existing role with no entries falls back to built-in entries while retaining that role's own grants. Model retries reuse the same snapshot and stay within the selected role's session.
- Keep the existing ask and tell session identities, histories, models, and record ids separate. A role-specific cancel or reset affects only that role. Preserve the preceding plan's all-role close behavior for tab cleanup, shutdown, plugin teardown, and shared remote transport loss.
- Give each pending prompt its own mutable set of the running transcript entries it appends. Register each turn's new running Markdown entry with that set before the model can stream into it. Add an optional entry-set filter to `RunningEntryMatch`; `updateRunningEntry` must transfer membership from the old object to its immutable replacement as it already does for the tab-wide `acpEntries` WeakSet. `runCorePrompt` updates and `settleAcpPrompt`'s final-running-entry lookup use the pending prompt's set, so neither can select the other role's entry or a shell entry.
- Keep the tab busy while either role has a pending prompt. After clearing the settling role's pending prompt, `settleAcpPrompt` deletes the tab busy flag only when `hasAcpPrompt` reports no other role prompt; retain `acpEntries` and `acpRecordIds` as tab-wide ownership sets.
- Replace the ask-only no-model error with a role-aware formatter used by both `start` and `run`, preserving `ACP: the ask role lists no models.` and returning `ACP: the tell role lists no models.` for tell. Pass the role to the every-model-failed formatter for both startup and prompt retries so its first line names that role; retain the existing fallback notice and one-entry failure behavior.
- This subplan exposes and tests role-aware ACP orchestration directly. The shell `tell` command, its user-facing primer, and tell-specific reset command are introduced in the following subplan.

## Existing code to reuse

| Location | Existing behavior |
| --- | --- |
| `src/acp/manager.ts:38-65` (`start`, `prompt`) and `:78-98` (`run`), `:104-145` (`attempt`, `settleAttempt`) | Owns role settings snapshots, prompt reservation, model queue, and retry flow. Make the overlap check role-specific and carry that same role through startup errors, retries, and settlement. |
| `src/acp/session-manager.ts:18-36` (`AcpSessionManager` and `session`) and `:105-129` (`close`, `closeTab`, and `closeAll`) | Owns independent ask/tell sessions and defaults existing manager calls to ask. Keep role-specific cancellation/reset and all-role lifecycle close behavior. |
| `src/acp/role-state.ts:7-18` (`acpRoleRuntime`, `existingAcpRoleRuntime`, and `hasAcpPrompt`) and `src/acp/prompt-state.ts:4-18` (`AcpPendingPrompt`) | Store pending prompts per role and expose the existing all-role pending check for busy cleanup. Add the per-prompt running-entry identity set to the pending state. |
| `src/acp/ask-role.ts:8` (`NO_ASK_MODEL`), `:28-52` (`readRoleSettings`), and `:80-86` (`exhaustedError`) | Resolve named role entries/grants and format model errors. Generalize the ask-only no-model and exhaustion messages without changing ask wording. |
| `src/acp/run-prompt.ts:16-24` (`runCorePrompt` and `updateRunning`) and `:60-84` (`startTurn`, `endTurn`, and settlement handlers) | Appends each role's running Markdown entries, streams into them, and runs the shared tool loop. Register and use the current pending prompt's entry set here. |
| `src/acp/response.ts:10-18` (`appendAcp`) and `:31-48` (`settleAcpPrompt`) | Marks ACP transcript entries tab-wide and settles the role's pending request. Restrict final-entry lookup to that pending request and clear busy only after both roles settle. |
| `src/tab/transcript/events.ts:13-45` (`RunningEntryMatch` and `updateRunningEntry`) and `src/tab/transcript/state.ts:26-31` (`finishRunning` and `updateRunning`) | Select the last running entry and carry tab-wide ACP ownership across immutable replacements. Add a prompt-entry set match and move membership from each old object to its replacement. Keep other transcript writers' existing match behavior unchanged. |
| `src/tab/manager.ts:81-86` (`addBusy` and `deleteBusy`), `src/tab/runtime-operations.ts:17-25` (`addBusy` and `deleteBusy`), and `src/acp/loop.ts:17-42` (`runAcpToolLoop` turn lifecycle) | Busy is a tab-wide boolean raised at each ACP turn. Use `hasAcpPrompt` after role settlement to avoid clearing it while the other role is pending. |
| `src/remote/protocol-frames.ts:148-156` (`acp-open`, `acp-prompt`, `acp-cancel`, and `acp-close`), `src/remote/acp-session.ts:46-60` (`createRemoteAcpSession`), and `src/remote/channel/acp.ts:13-25` (`dispatchAcp`) | ACP frames and listeners already use a per-session id. Open both role sessions on the same channel with distinct ids; do not add a protocol frame type. |
| `src/acp/manager.test.ts:572-598` (`remoteSetup`) and `src/acp/record-feed.test.ts:227-300` (role record and lifecycle coverage) | Provide a shared-channel fake and real tab/record fixtures for role session, record, and cleanup tests. Extend these fixtures rather than rebuilding them. |

## Proposed changes

- Thread role through manager prompt setup, same-role overlap checks, session lookup, retries, `runCorePrompt`, cancellation, and settlement. Check `existingAcpRoleRuntime(runtime, role)?.prompt` for prompt refusal; reserve `hasAcpPrompt` for the all-role busy check. Preserve ask as the default and make cross-role prompts independent.
- Generalize no-model and all-model-failed messages in `src/acp/ask-role.ts`; preserve the exact ask messages while naming tell in tell failures from both `start` and prompt fallback. Return `Usage: tell <prompt>.` for an empty tell prompt. Keep `src/acp/manager.ts` under 200 nonblank, noncomment lines; extract its `Attempt` and retry/settlement helpers to `src/acp/attempt.ts` if this change would cross the limit.
- Add a mutable `Set<LogEntry>` of running-entry identities to `AcpPendingPrompt`. In `runCorePrompt`, create each turn's running Markdown `LogEntry`, add that same object to the pending set, then append it before the model can stream. In `src/tab/transcript/events.ts`, let `RunningEntryMatch` restrict updates to that set; when an immutable replacement is made, delete the previous object from the set and add its replacement.
- Make both streaming updates and the running-entry finalization in `src/acp/response.ts` use the pending prompt's entry set. After clearing that role's prompt, clear the tab busy flag only if no role has a pending prompt.
- Update `product/specs/acp.md` for same-tab ask/tell concurrency, same-role overlap refusal, role-scoped cancellation/reset, role-specific model failure messages, prompt-local transcript updates, and busy state lasting until both prompts settle. Keep the no-tell-command boundary clear for this step.

## Tests

- `src/acp/manager.test.ts`: verify role-specific pending checks permit ask/tell together but refuse a second prompt in the same role; keep distinct session identities; verify cancelling/resetting one role leaves the other's prompt and session active; and confirm tab-wide `withoutTools` applies to both. Retain the preceding plan's all-role close tests.
- `src/acp/manager-fallback.test.ts`: verify tell's exact no-enabled-model and every-model-failed messages from both `start` and prompt retries, `Usage: tell <prompt>.`, tell's own model fallback order, and unchanged ask wording and fallback notices.
- `src/acp/record-feed.test.ts`: run ask and tell streams together with distinguishable chunks and answers, interleave their updates and settlements, and verify each running transcript entry and durable record receives only its own content. Assert the tab stays busy after the first prompt settles and becomes idle after the second.
- `src/tab/transcript/events.test.ts`: with two running Markdown entries and separate entry sets, prove a match updates only its selected entry; verify immutable replacements move membership to the replacement so subsequent chunks and finalization still find it; and retain the existing tab-wide `acpEntries` behavior.
- `src/acp/manager.test.ts`: extend `remoteSetup` to open ask and tell on one channel, assert distinct `racp` ids and `acp-open` frames, and deliver chunks/end frames to each session listener independently. No `src/remote/protocol-frames.ts` change is expected.
- Keep existing tests for tab closure, shutdown/`closeAll`, plugin teardown, and remote transport loss from the role-keyed-session subplan passing; extend only a coverage gap those tests expose.

## Verification

- Run `$janissary/scripts/run.mjs check-diff` after each implementation change and after tests.
- Manual check on one tab: start ask and tell sessions, send both prompts, interleave distinguishable partial chunks, then settle ask first. Confirm ask and tell update separate transcript entries and records, and the tab remains busy until tell settles. Repeat while cancelling ask and confirm tell can continue to completion; confirm a second ask is refused while tell remains independently available.

## Out of scope

- Adding the `tell` and `tell reset` command definitions or user-facing tell primer.
- Role-prefixed connection labels, connection lookup, or record-tab close routing.
- Changing session policies for monitors, conversations, or editor personas.
