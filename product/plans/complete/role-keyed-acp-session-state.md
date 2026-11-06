# Role keyed ACP session state

**Complexity: 5/10** — role-scoped runtime state and session ownership cross ACP lifecycle, record persistence, and every reader of the current single-role slots.

## Goal

Represent each tab's ACP prompt and current durable record by role, and let the ACP session manager own one session per tab and role while existing callers continue using the default `ask` role.

## Decisions and dependencies

- Depends on the completed `product/plans/complete/role-based-acp-tool-filtering.md`, which captures one role settings snapshot for each prompt. This subplan changes session and record ownership only; it preserves the current prompt settings and command filtering behavior.
- Define the core role identity as `AcpRole` in `src/acp/role.ts`, limited to `ask` and `tell`. Do not use the roles file's general `Role` type, whose names are user-editable.
- Replace the single prompt and current-record slots on `TabRuntime` with a role-keyed state. Each role state holds its pending prompt and current durable record id. Keep the physical ACP session, model entry, and session identity owned by `AcpSessionManager` in a nested tab-label then role session map; do not duplicate the session identity in runtime state. Keep `acpEntries` and `acpRecordIds` tab-wide because they mark transcript entries and durable records across roles. Keep `acpWithoutTools` tab-wide.
- Add an optional final `AcpRole` parameter, defaulting to `ask`, to existing manager operations that address a session: `start`, `prompt`, `promptResult`, `run`, `cancel`, `close`, `session`, `has`, `label`, and `sessionIdentity`. Preserve all existing argument positions so current callers remain source-compatible. Apply the same default to internal session lookup, entry, and current-session helpers. A role-specific close resets only that role; `closeTab`, `closeAll`, and `dispose` close every role owned by their tab or manager.
- A failure of one local ACP model closes only that role's session. Tab closure, plugin teardown, shutdown, and loss of a remote tab's shared transport close all role sessions for that tab. `closeTabResources` remains the shared tab cleanup path.
- Tag every new core ACP record with its canonical `AcpRole`. Add the optional role only to the ACP branch of `AcpRecordSource`; agent records are unchanged. Keep `ACP_RECORD_SCHEMA_VERSION` at 1 because the optional field is backward-compatible: version-1 records without a role continue to validate and retain their stored title and name. Project the optional role onto `AcpRecordRow` as well, so the later connection-identity subplan can use it without reopening the record source.
- Plugin capability calls `startAcp`, `promptAcp`, `promptAcpResult`, and `resetAcp` continue to use the default `ask` role without a contract change. Connection actions in this subplan continue resolving the ask record; role-qualified live connection names and role-specific record actions belong to the later connection-identity subplan.
- This subplan does not enable simultaneous prompts or match streaming transcript entries to a specific prompt. The following prompt-isolation subplan must land before `tell` can start prompts independently on the same tab.

## Existing code to reuse

| Location | Existing behavior |
| --- | --- |
| `src/tab/types.ts:285-296` (`acpEntries`, `acpPrompt`, `acpRecordId`, `acpRecordIds`, and `acpWithoutTools`) | Replace only the prompt and current-record fields with role-keyed state; retain the tab-wide transcript markers, owned-record set, and tool override. |
| `src/acp/session-manager.ts:16-30` (`sessions`, `has`, `label`, `sessionIdentity`, and `session`) and `:93-125` (`close`, `closeTab`, `closeAll`, `currentSession`, `entryOf`, and `isCurrent`) | Keep session handles and identities here, add a role key, and preserve ask as the default. `:72` (`onTransportLost`) is the existing remote-loss callback. |
| `src/acp/manager.ts:37-79` (`start`, `prompt`, `promptResult`, and `run`), `:99-112` (`attempt`), and `:154-187` (`cancel` and `acquire`) | Owns the active prompt checks, pending-prompt write/read, model retries, cancellation, and per-session failure callbacks; make each access use the selected role state. |
| `src/acp/record-feed.ts:8-36` (`ownRecord`, `beginCoreRecord`, `promptCoreRecord`, `coreActivity`, and `closeCoreRecord`), `src/acp/response.ts:29-42` (`settleAcpPrompt`), and `src/acp/run-prompt.ts:15-20` (`runCorePrompt` and `active`) | Connect the prompt and current record to one role state while keeping transcript entries marked tab-wide. |
| `src/acp-records/types.ts:3-60` (`AcpRecordSource`, `AcpRecord`, and `AcpRecordRow`), `src/acp-records/model.ts:39-58` (`recordRow` and `recordWindow`), and `src/acp-records/validation.ts:15-20` and `:67-81` (`isRecordSource` and `isAcpRecord`) | Add optional persisted and row metadata for ACP records, carry it through row projection, and validate present roles while accepting legacy absence. `src/acp-records/store.ts:64-71` (`read`) validates records on disk. |
| `src/controller/connection-records.ts:12-22` (`openConnectionRecord`), `src/plugins/connections-topic-actions.ts:64-80` (`actOnCoreRecord`), and `src/plugins/connections-topic-rows.ts:55-71` (`liveTabRows`) | Continue resolving the ask role's current record until the later role-aware connection-identity subplan changes these surfaces. `acpRecordIds` ownership remains tab-wide at `connections-topic-rows.ts:127-131` (`ownsRecord`). |
| `src/tab/cleanup.ts:14-60` (`closeTabResources`) and `src/plugins/acp-capabilities.ts:15-36` (`acpCapabilities`) | Tab cleanup already calls each manager's `closeTab`; the existing plugin capability wrappers call the manager without a role and therefore retain ask behavior. |

## Proposed changes

- Add `AcpRole` and the role-state type under `src/acp/`, then update `TabRuntime` to hold role-keyed pending prompt and current record state. Avoid a new map keyed only by tab label in `Controller`; the tab runtime remains the owner of prompt and record state for that tab incarnation.
- Re-key `AcpSessionManager.sessions` by tab label and `AcpRole`. Thread the selected role through session creation, identity/model lookup, liveness checks, entry lookup, cancellation, and close. Keep existing ask call sites unchanged through the default role. Make `closeTab` and `closeAll` iterate all role sessions; a role-specific `close` settles that role's pending prompt and closes only its record.
- Update `src/acp/manager.ts` as well as the other old-slot readers. Every pending-prompt check, write, cancellation lookup, error callback, and `runCorePrompt` active predicate must use the selected role's state. Preserve current model retry behavior and pass the same role through each retry.
- Update `src/acp/record-feed.ts` so begin, prompt, activity, and close operations select one role's record state; retain every record id in the tab-wide `acpRecordIds`. Update `src/acp/response.ts` to settle and clear the selected role's pending prompt, and `src/acp/run-prompt.ts` to check that role's pending prompt while writing activity to that role's current record.
- In `src/acp/session-manager.ts`, include the canonical role on the source passed to `beginCoreRecord`. Extend the ACP source and row types, record projection, and validation to accept only `ask` or `tell` when role is present. Leave a missing role valid for older version-1 records and leave agent sources unchanged; do not migrate or rewrite saved files.
- Move the current-record readers in `src/controller/connection-records.ts`, `src/plugins/connections-topic-actions.ts`, and `src/plugins/connections-topic-rows.ts` to the ask role's record state. Do not introduce tell-specific connection routing or names in this subplan.
- Update `product/specs/acp.md` and `product/specs/connections-tab.md` for role-owned sessions and records, legacy record compatibility, ask-default plugin behavior, and the fact that tell prompts are not exposed until later subplans.

## Tests

- `src/acp/manager.test.ts`: verify explicit role sessions do not replace each other's session identity, all existing operations default to ask, a role-specific close settles only that role, and `closeTab`/`closeAll` close both roles. Cover that a model failure closes only its own role.
- `src/acp/record-feed.test.ts` and `src/acp/plugin-session.test.ts`: verify role-specific prompts and durable record ids stay associated, ask plugin capabilities keep their existing behavior, and closing one role retains the other role's record and prompt state.
- `src/acp-records/store.test.ts` and `src/acp-records/manager.test.ts`: round-trip an ask- or tell-tagged core record, reject an unknown present role, accept a legacy record without role, and verify row projection preserves role when present and omits it when absent.
- Update tests that construct or inspect the removed direct runtime fields: `src/tab/view.test.ts`, `src/acp/record-feed.test.ts`, `src/acp/plugin-session.test.ts`, `src/acp/index.test.ts`, `src/controller/connection-records.test.ts`, `src/controller/create-managers.test.ts`, `src/plugins/connections-topic.test.ts`, `src/plugins/connections-topic-rows.test.ts`, and `src/plugins/acp-records.test.ts`. Retain tests of tab-wide `acpEntries`, `acpRecordIds`, and `acpWithoutTools` unchanged except where the fixture uses a removed slot.
- Exercise tab cleanup and shared remote transport loss with both role sessions open; verify `closeTabResources` and the remote-loss callback leave neither session or record active. Keep the existing ask-only capability, prompt settlement, and legacy record fixtures passing.

## Verification

- Run `./scripts/run.mjs check-diff` after each implementation change and after tests.
- Manual check: run an `ask` prompt through a plugin capability and confirm it still uses the ask model, transcript, and record. Close/reset ask and confirm its record closes, then reopen ask and confirm the next prompt starts a fresh conversation. Load an existing version-1 record without role metadata and confirm it remains visible with its existing title and name.

## Out of scope

- Exposing a `tell` command or changing connection names and routing; those have later subplans.
- Running ask and tell prompts concurrently or matching streamed transcript entries to an individual prompt; the prompt-isolation subplan owns that work.
- Changing ACP record history, retention, or non-core consumers' permission policies.
