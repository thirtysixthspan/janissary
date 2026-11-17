# Subagent records and connection names
**Complexity: 6/10** — ~60 added production lines, 9 existing files, 7 requirements, 18 scenarios (p=6.01)

## Goal

Thread optional `subagentRole` from `AgentRunOptions` through manager metadata and `AgentRecordFeed` into the agent variant of `AcpRecordSource`, row projection, `ConnectionsTopicRecordRow`, `RecordConnectionRow`, and agent `ConnectionSource`. Keep the field named `subagentRole`; non-ACP rows continue rejecting `role`.

Source: `product/plans/complete/subagent.md`, preserved unchanged as the canonical feature record. This is ordered subplan 3 of 23.

## Decisions and dependencies

Dependencies: `product/plans/ready/subagent-1-grammar-and-primers.md`, which creates the subagent spec extended here. No later launch or command API is required.

Implement and verify only against existing repository code and the completed earlier dependencies. Other units own their own changes; references to them explain integration boundaries and do not authorize future API calls. Every new production module stays within 200 counted lines, source imports name defining modules directly with .js extensions, and shared wire definitions are imported by the client.

## What already exists (reuse, don't rebuild)

`AgentRunManager.create` at `src/agent/manager.ts:33` validates provenance before acquiring a lease and calls `ownRecord` at line 57. `validateAgentRecordMetadata` at `src/agent/record-feed.ts:7` copies supplied metadata. `recordTitle` and `recordRow` at `src/acp-records/model.ts:9,38` own title and summary projection; `recordWindow` at line 63 already spreads the row and source. `durableRows` at `src/plugins/connections-topic-rows.ts:113` spreads each row into the topic, and `ConnectionRecordTabs` at `src/plugins/connections/record-tabs.ts:7` uses `recordConnectionName` for tab titles. The connections shared module is import-free. The caller popup is a separate projection: `ConnectionManager.activeAgentRows` at `src/connection/manager.ts:27` currently hard-codes `Agent: ${run.view().task}` and needs the explicit change below.

## Planned file scope

Edit `src/agent/run.ts`, `src/agent/manager.ts`, `src/agent/record-feed.ts`, `src/acp-records/types.ts`, `src/acp-records/model.ts`, `src/acp-records/validation.ts`, `src/plugins/connections/shared.ts`, `src/protocol/connections.ts`, `src/connection/manager.ts`; extend `src/agent/record-feed.test.ts`, `src/agent/manager.test.ts`, `src/acp-records/model.test.ts`, `src/plugins/connections/shared.test.ts`, `src/plugins/connections-topic-rows.test.ts`, `src/connection/manager.test.ts`, `web/src/plugins/connections/ConnectionList.test.tsx`, `web/src/plugins/connections/ConnectionTab.test.tsx`; add `src/acp-records/validation.test.ts`; update `product/specs/acp-records.md`, `product/specs/connections-tab.md` and record provenance in `product/specs/subagent.md`.

Only the named implementation, test and spec/help files belong to this unit. Update the named behavior spec with this unit rather than deferring it to final documentation work. A new colocated test named above may be created when absent. Keep additions focused; do not compact code to fit the line limit.

## Implementation steps

1. Thread optional `subagentRole` from `AgentRunOptions` through the metadata constructed by `AgentRunManager.create` and copied by `AgentRecordFeed` into the agent variant of `AcpRecordSource`, `AcpRecordRow`, `ConnectionsTopicRecordRow`, `RecordConnectionRow`, and agent `ConnectionSource`. Copy it in `recordRow` only for agent sources when defined. Existing `recordWindow` and `durableRows` spreads then preserve it without new production changes at those sites. Keep the field named `subagentRole`; non-ACP plugin rows and sources continue rejecting `role`. The caller supplies canonical role spelling; this layer does not read roles or normalize it.

2. Validate a defined subagent role as a string with nonempty trimmed content in `validateAgentRecordMetadata`, `isRecordSource`, and the agent branches of the import-free plugin row/source guards. Preserve its supplied spelling. Omit the property when absent rather than spreading an explicit undefined into metadata's `Object.values` validation. A subagent record title is `Subagent: <task filename>` using the original captured task selector's basename, with no ACP title cap; task snapshot resolution and later caller renames do not retitle it. Extend `recordConnectionName`'s accepted projection with optional `subagentRole` and branch on an agent row with that field to return `subagent:<canonical role>`. Ordinary agent and ACP names remain unchanged.

3. Update `ConnectionManager.activeAgentRows` to use the durable subagent record's title for its popup text. Read the record summaries once per projection and look up each eligible run's record; a row with `subagentRole` uses its captured `Subagent: <task filename>` title. Ordinary agent rows keep the existing `Agent: ${run.view().task}` behavior, including its resolved-task naming. Retain the current run-outcome and caller-incarnation filters, ACP kind, recordId and absence of acpRef. This is required production work: `ownRecord` supplies ownership, not the popup label.

4. Reuse retained records, `ConnectionRecordTabs`, existing Terminate and Focus tab actions and client naming consumers. The popup row leaves on settlement while the retained connections row remains; long names keep existing ellipsis treatment. The additive field needs no stored-record or plugin payload schema bump: legacy records without it continue loading unchanged. Test the existing spread projections rather than adding redundant copying or a client-specific naming path. No new tab, panel, key binding, or client feature directory is added. All nine production files remain below 200 counted lines; `src/agent/run.ts` gains only the options field and no unrelated lifecycle implementation.

## Tests

Use the existing run/record fixtures in `src/agent/manager.test.ts:19` and `src/agent/record-feed.test.ts:19`. Verify manager metadata forwarding, canonical role spelling, invalid empty/whitespace/non-string role rejection before record/lease creation, ordinary metadata without the optional field, basename/title capture before `setSnapshot`, row and window-source projection, and stored subagent provenance reloading through the existing `AcpRecordStore` fixture. Legacy agent and ACP records still load without migration. Add focused source-validation tests in the new validation.test.ts.

Extend the shared-contract fixtures in `src/plugins/connections/shared.test.ts:8` for subagent Name, valid/invalid optional role metadata on both row and window source, existing non-ACP `role` rejection, and legacy names. Pin row-field preservation through `composeConnectionsTopicData` in `src/plugins/connections-topic-rows.test.ts`, including a loaded window. Extend `src/connection/manager.test.ts:93` and the manager's existing caller-owned popup integration test to assert the captured subagent title, ordinary agent text unchanged, no ACP reference, and omission after settlement or caller reincarnation. Add subagent fixtures to the existing connection list/tab tests to pin the rendered Name/title and existing Terminate/Focus actions; no public subagent launch API is needed.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after implementation changes. Do not run `npm run check`.

Manual or fixture check: Create a synthetic manager run with `subagentRole` and an original task selector, replace its task snapshot, then inspect its connection row, opened connection tab title and caller popup. They show `subagent:<role>` and `Subagent: <original task filename>` in their respective surfaces, while an ordinary agent fixture keeps its existing names. Settle the run and confirm only the popup row leaves. The public launch command remains unwired.

## Out of scope

No Partial status, execution, lifecycle ownership extension, protocol selector, or new UI surface.
