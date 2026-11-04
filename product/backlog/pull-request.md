<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

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
