<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Plan fidelity: correct the plugin guideline's claim that API v3 removed the agent launch contract.

Existing Issue: The present-tense v3 paragraph in `ai/guidelines/plugins-tabs.md` says API v3 removes the agent launch contract, while `product/specs/tab-plugins.md` and the developer reference's v2 section record the agent-tab launch removal as a v2 change and v3 only removes `useAcpResponse`, `TabView.acpResponse`, `launchShellHere`, and the panel/Reset controls. Severity: 3/10

Existing Risk: 3/10 - A plugin author reading the current guideline attributes the removal to v3 and may misread a v2-era plugin as still supported or look for a v2 migration path that no longer applies.

Proposal Risk: 1/10 - The wording will agree with the spec, but the historical v2 note remains deep in the changelog and could still be missed; no behavior changes.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "correct the guideline's API version for the agent launch removal". In `ai/guidelines/plugins-tabs.md`, change the API-version paragraph to state that the agent launch contract was removed in API v2, and keep the v3 removal list limited to `useAcpResponse`, `TabView.acpResponse`, `launchShellHere`, and the panel/Reset controls. Align it with `product/specs/tab-plugins.md`'s API v2 and v3 sections and `documentation/developer-documentation/tab-plugins.md`'s v2 changelog, preserving the historical v1 `useAcpResponse` introduction note. Verify by rereading the guideline's version paragraph against both sources; the migrated `src/plugins/documentation.test.ts` topic/count assertions must keep passing unchanged.


* Plan fidelity: remove the transcript spec's stale claim that the removed core ACP panel reuses the collapse formatter.

Existing Issue: `product/specs/transcript.md` still says the core ACP panel reuses `flattenBuffer` for its response slice, but API v3 removed that panel and the delivered shell shows a settled reply while connection-tab history renders separately. Severity: 4/10

Existing Risk: 4/10 - An implementer reading the current transcript spec preserves or reintroduces a panel-shaped response slice that the delivered UI no longer has, and the authoritative behavior doc keeps the removed surface alive.

Proposal Risk: 1/10 - The spec will describe the retained shared tool-step collapse without the panel, but it remains prose with no direct test; the existing transcript and connection-tab tests still pin the actual collapse and history behavior.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "remove the stale ACP panel reference from the transcript spec". In `product/specs/transcript.md`, replace the sentence claiming the core ACP panel reuses `flattenBuffer` for its response slice with a description of the retained per-tab `Tab.toolStepsExpanded` collapse for shell and agent transcript entries, and state that connection-tab thought/tool entries use their own expandable rendering rather than a panel response slice. Keep the `Ctrl+T` and `flattenBuffer` description and the `[[acp]]` link. Cross-check `product/specs/acp.md`, `product/specs/keyboard-navigation.md`, and `web/src/shared/transcript/transcript-line.tsx`; the existing transcript and formatting tests must keep passing unchanged.


* Description fidelity: describe ACP record retention as a startup prune rather than automatic removal 30 days after closure.

Existing Issue: The Connections guide says closed ACP records are "removed automatically 30 days after they close", while `src/acp-records/manager.ts` prunes only during startup against `ACP_RECORD_RETENTION_MS`, and `documentation/user-documentation/advanced-agents/acp-agent.md` correctly says records closed more than 30 days before startup are removed then, not on a rolling timer. Severity: 4/10

Existing Risk: 4/10 - A user expects a closed record to disappear at the 30-day mark and is surprised when it remains until the next restart, or trusts a retention guarantee the store does not provide.

Proposal Risk: 1/10 - The guide will state the real startup boundary, but retention remains startup-only and can still surprise a user who never restarts; making the rule explicit is the honest limit.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "state startup-only ACP record retention". In `documentation/user-documentation/command-bar/connections.md`, change the retention sentence to say records closed more than 30 days before startup are removed at startup, not on a rolling timer, matching `documentation/user-documentation/advanced-agents/acp-agent.md`. Align `product/specs/connections-tab.md`'s retention sentence with the same wording and link it to `[[acp-records]]` as the 07 reconciliation requires; do not change `src/acp-records/manager.ts` or the fixed `ACP_RECORD_RETENTION_MS` behavior. The existing `src/acp-records/manager.test.ts` strictly-beyond-30-days closure case remains the source of truth.


* Description fidelity: correct the guides' claims about monitor and editor-persona rows in a tab's connections window.

Existing Issue: The Connections guide says a monitor or editor-persona row "focuses its owning tab", but in a tab's connections window `web/src/shared/status-windows/StatusPanels.tsx` only makes durable-record and tab-scoped ACP rows openable, so those rows cannot focus anything; the ACP guide also says monitor rows keep snapshot buttons, while only `web/src/editor/EditorConnectionsPanel.tsx` passes `onOpenAcpTranscript` and shell or harness windows draw no such button. Severity: 3/10

Existing Risk: 3/10 - A user clicks a monitor or persona row in a shell or harness window expecting its owner to focus, or looks for a snapshot button that is only drawn in an editor tab, and concludes the row or the feature is broken.

Proposal Risk: 1/10 - The guides will distinguish the surfaces, but the row behavior remains intentionally asymmetric, so readers must still learn that the connections tab and a tab's window differ.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "clarify live-only monitor and persona rows by surface". In `documentation/user-documentation/command-bar/connections.md`, state that in the connections tab a monitor or editor-persona row focuses its owning tab and never opens a record, while in a tab's connections window those rows stay snapshot-only and do not open or focus a record. In `documentation/user-documentation/advanced-agents/acp-agent.md`, qualify the snapshot sentence so only an editor tab's connections panel draws the monitor and persona snapshot buttons, and shell or harness windows do not. Cross-check `web/src/shared/status-windows/StatusPanels.tsx` (the `rowCanOpen` rule), `web/src/editor/EditorConnectionsPanel.tsx` (the only `onOpenAcpTranscript` caller), and `src/plugins/connections-topic-rows.ts` plus `web/src/plugins/connections/ConnectionList.tsx` for the connections-tab focus path. The existing `StatusPanels.test.tsx` non-openable-row cases and `useEditorConnections.test.ts` snapshot-only cases must keep passing unchanged.


* Plan fidelity: record 07's actual verification results and partial manual status instead of completing the plan with its planning-pass ledger.

Existing Issue: The plan is moved to complete while its verification ledger still says the documentation, help, and requirement-map suites were "not rerun by this planning pass" and asks implementation to record commands and results, with no 07 implementation SHA, build or chunk-closure result, or per-scenario manual outcome recorded anywhere in the commit, even though the commit message says it records the integration evidence. Severity: 5/10

Existing Risk: 4/10 - The completed plan implies a verification record it does not contain, so a later reviewer or release owner cannot distinguish the focused suites and builds that ran from the manual scenarios that did not, and may treat 07 as fully verified.

Proposal Risk: 2/10 - The ledger will honestly record the available automated and build evidence plus the explicit partial manual coverage, but M3, M4, M5, and M7 remain unexercised until their browser and remote resources exist.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "record the 07 verification ledger results". Update the verification table in `product/plans/complete/connections-tabs-07-specs-docs-integration.md` with the actual focused suite commands and results, the `npm run docs:build` and `npm run build:web -- --manifest --sourcemap` outcomes including the connections dynamic-entry and chunk-closure check or its concrete unavailable reason, and the 07 implementation SHA. Record the manual result honestly: M3, M4, M5, and M7 were not exercised, state the missing assigned-browser, authenticated provider, and compatible remote-host resources, and do not claim a fully manually verified feature. If some evidence exists only in the implementation report, summarize it with its source rather than inventing results. This is a plan-record correction, not a production or test change; the migrated `src/plugins/documentation.test.ts` assertions must keep passing.
