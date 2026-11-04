# Clarify live-only monitor and persona rows by surface

**Complexity: 2/10** — two prose corrections in existing user guides, checked against the popup row-opening rule, the only snapshot-button caller, and the connections-tab focus path; no runtime, test, or behavior change.

## Goal

Resolve PR #1916's recorded finding: "Description fidelity: correct the guides' claims about monitor and editor-persona rows in a tab's connections window." The Connections guide currently says a monitor or editor-persona row focuses its owning tab without distinguishing the connections tab from a tab's floating connections window, and the ACP guide says monitor and persona rows keep their snapshot buttons without saying that only an editor tab's panel draws them. Each surface must be described accurately.

## Approach and evidence

`web/src/shared/status-windows/StatusPanels.tsx:28`–`:29` lets a row open only when it carries a durable `recordId` or a tab-scoped `acpRef`. Monitor and editor-persona rows carry `acpRef` scopes `monitor` and `editor` (`src/monitor/info.ts:47`, `src/editor/acp-manager.ts:88`), so the floating window renders them with no click handler, no button role, and no tab stop: they cannot focus a tab or open a record. `web/src/editor/EditorConnectionsPanel.tsx:19` is the only caller that passes `onOpenAcpTranscript`, and `StatusPanels.tsx:56`–`:66` draws the snapshot button only when that handler is supplied, so shell and harness windows draw none.

The connections tab is different. `src/plugins/connections-topic-rows.ts:32`–`:37` gives every live tab-scoped catalog row, including monitor and persona rows, a `focusTarget` of its owning tab, and `src/plugins/connections-topic-actions.ts:54`–`:57` focuses that tab when the row opens. Those rows are live rows, never durable record rows, so they never open a record tab.

The specs already state both truths: `product/specs/connections-tab.md:11` says live-only monitor and editor-persona rows focus their owning tab and never open a record tab, and `product/specs/connections-tab.md:29` plus `product/specs/connection.md:61` say those rows stay snapshot-only and that shell and harness windows render no snapshot button. No spec change is needed.

Correct only the two inaccurate guide passages: `documentation/user-documentation/command-bar/connections.md:56` and `documentation/user-documentation/advanced-agents/acp-agent.md:57`. Leave the adjacent accurate passages in both guides, the specs, and the tests untouched.

## Implementation steps

1. In `documentation/user-documentation/command-bar/connections.md`, rewrite the paragraph after the lookup list so it says the connections window and the connections tab open retained records the same way, then separates the surfaces: in the connections tab a monitor or editor-persona row is live-only and focuses its owning tab without opening a record; in a tab's connections window those rows stay snapshot-only and do not open or focus a record.
2. In `documentation/user-documentation/advanced-agents/acp-agent.md`, qualify the snapshot sentence so only an editor tab's connections panel draws the monitor and persona snapshot buttons, while shell and harness windows draw none. Keep the shell row's separate **Open transcript** statement unchanged.
3. Re-read `web/src/shared/status-windows/StatusPanels.tsx`, `web/src/editor/EditorConnectionsPanel.tsx`, `src/plugins/connections-topic-rows.ts`, and `src/plugins/connections/ConnectionList.tsx` against the revised prose.
4. Run `$janissary/scripts/run.mjs check-diff`; a Markdown-only change selects no source lint, typecheck, or related test job.
5. Promote this plan to `product/plans/complete/` and remove only the resolved entry from `product/backlog/pull-request.md`, preserving the remaining entry byte-for-byte.

## Tests and verification

- No new tests: this correction changes prose, not behavior. `web/src/shared/status-windows/StatusPanels.test.tsx`'s monitor- and editor-scoped "non-openable" cases and `web/src/editor/useEditorConnections.test.ts`'s snapshot-only cases remain the source of truth and must keep passing unchanged.
- Run the two focused suites to confirm they stay green: `npm run test:client -- web/src/shared/status-windows/StatusPanels.test.tsx web/src/editor/useEditorConnections.test.ts`.
- Compare the corrected wording against `StatusPanels.tsx:28`–`:40` and `:56`–`:66`, `EditorConnectionsPanel.tsx:19`, `connections-topic-rows.ts:32`–`:37`, and `connections-topic-actions.ts:54`–`:57`.
- Review the final diff for only the two prose files, this completed plan, and the backlog removal; run `git diff --check`.

## Out of scope

- Production source, tests, schemas, and runtime behavior.
- Functional specs, which already describe both surfaces accurately.
- Help pages and other user-documentation pages that do not repeat the inaccurate claims.
- The pull request's title and body, any other backlog entry, and merging, closing, or rewriting the pull request's history.

## Completion

- Qualified the connections-tab focus claim by surface in the Connections guide, and restricted the monitor and persona snapshot buttons to an editor tab's connections panel in the ACP guide.
- `npm run test:client -- web/src/shared/status-windows/StatusPanels.test.tsx web/src/editor/useEditorConnections.test.ts` passed both files and all 28 tests, including the non-openable-row and snapshot-only cases.
- `$janissary/scripts/run.mjs check-diff` selected no source checks for the Markdown-only change, and `git diff --check` passed.
- Removed only the resolved backlog entry, leaving one entry unchanged.
