# Role keyed ACP session state

**Complexity: 5/10** — migrates tab runtime and session ownership from one ACP slot to role-keyed state across record, response, and lifecycle consumers.

## Goal

Represent each tab's ACP prompt and current durable record by role, and let the ACP session manager own one session per tab and role while existing callers continue using the default `ask` role.

## Decisions and dependencies

- Depends on `role-based-acp-tool-filtering.md` so all current ask prompts continue to resolve the same role configuration and tool grants.
- Introduce one core ACP role type for `ask` and `tell`, and a role-keyed runtime state whose value holds that role's session identity, pending prompt, and current durable record id. Each role retains its own conversation history, model, and record; the transcript text remains shared on the tab. Manager APIs in this subplan continue to default to `ask`; tell-specific public calls arrive in a later subplan.
- Keep `acpEntries` and `acpRecordIds` tab-wide because they identify ACP-owned transcript entries and records across roles. Keep `acpWithoutTools` tab-wide.
- Key sessions by both tab label and role. Session lookup, `label`, `close`, `entryOf`, `isCurrent`, and `currentSession` accept a role defaulting to `ask`. Close both roles on tab close, shutdown, plugin failure, and remote transport loss. The runtime state remains on the tab record; do not add another tab-label map to `Controller`.
- Tag newly created core ACP durable records with their role. The record's `role` is optional when reading old persisted records, so existing records without it remain valid and retain their stored name.
- Preserve the behavior of plugin capability calls: `startAcp`, `promptAcp`, `promptAcpResult`, and `resetAcp` continue to address `ask` by default. A plugin failure or remote channel loss closes both role sessions owned by the affected tab, while a role-specific reset closes only its selected conversation.

## Existing code to reuse

- `src/tab/types.ts` owns `TabRuntime` and currently declares the single ACP prompt and record slots.
- `src/acp/session-manager.ts` owns per-tab ACP sessions and close lifecycle.
- `src/acp/record-feed.ts` and `src/acp/response.ts` attach prompt activity and transcript entries to the current runtime record.
- `src/acp-records/types.ts` and `validation.ts` validate stored ACP records.
- `src/acp/plugin-session.test.ts` and `src/acp/record-feed.test.ts` cover plugin sessions, durable records, and entry identity.

## Proposed changes

- Add the core role identity and role-keyed ACP runtime state in `src/acp/` and `src/tab/types.ts`.
- Update `src/acp/session-manager.ts` to key each role's session independently and to close both roles on tab close, shutdown, plugin failure, and remote transport loss while retaining ask defaults for existing callers.
- Move every old-slot reader to the role-keyed runtime state: `src/acp/response.ts`, `record-feed.ts`, `run-prompt.ts`, `src/controller/connection-records.ts`, `src/plugins/connections-topic-actions.ts`, and `src/plugins/connections-topic-rows.ts`.
- Add the optional role to ACP record source, stored record type, and validation; write a role for new core ACP records and continue accepting older records without one.
- Update `product/specs/acp.md` and `product/specs/connections-tab.md` for role-owned session state, record compatibility, and the ask-default behavior available at this step.

## Tests

- Update `src/acp/session-manager.test.ts` or its existing coverage for separate role slots, default ask lookup, and closing both roles.
- Update `src/acp/record-feed.test.ts` and `src/acp/plugin-session.test.ts` for ask-compatible record ownership and runtime migration.
- Add ACP record validation/store tests proving role-tagged records round-trip and legacy records without a role still validate.
- Update all tests that construct `TabRuntime` with the old direct ACP prompt or record fields.

## Verification

- Run `$janissary/scripts/run.mjs check-diff` after each implementation change and after tests.
- Confirm every consumer of the former single prompt and record fields has moved to the role-keyed state, and plugin callers still resolve ask without API changes.

## Out of scope

- Running ask and tell prompts concurrently or adding per-prompt transcript matching.
- Exposing a tell command or changing live connection names and routing.
- Changing ACP record history, retention, or non-core consumers' permission policies.
