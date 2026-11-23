<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Reconcile the connections spec's claim that an editor persona query's core row has an ordinary close control, which the read-only editor window does not provide.

Existing Issue: product/specs/connection.md's editor-tab paragraph says a persona query's connection is closed through "that core row's ordinary control," but the editor's connections window renders no close control on any row now that onCloseRow and canCloseRow were removed. Severity: 4/10

Existing Risk: 4/10 - A reader or user following the spec looks for a close control on the editor tab's core ACP row that does not exist, and either concludes the feature is broken or dismisses the session through an unrelated surface without realizing the window is deliberately read-only.

Proposal Risk: 2/10 - The fix is a prose edit to one spec paragraph; the only residual risk is wording that still implies a control on a different surface, which a read of the editor panel and StatusPanels resolves.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2185 "correct the connections spec's editor-row close-control claim". In product/specs/connection.md, edit only the editor-tab paragraph that begins "An editor tab carries the same connections button and window" so it states that the editor tab's connections window is read-only: it renders no close control for any row because onCloseRow and canCloseRow were removed from web/src/editor/EditorConnectionsPanel.tsx and web/src/editor/useEditorConnections.ts. State that a persona query's core session is closed through the `connections close acp:<role>:<provider/model>` command, or through the close control a core row has on surfaces that render one such as the connections tab, rather than through a control in the editor's own window. Keep the surrounding statements that no `<persona> (acp)` row is produced and there is no persona-specific close control. Verify the claim against web/src/shared/status-windows/StatusPanels.tsx, whose ConnectionRow renders a close control only when onCloseRow is supplied, and read web/src/editor/EditorConnectionsPanel.tsx to confirm the editor supplies none. Leave code, tests, and the pull request description untouched; the description was already corrected for this same issue and must stay byte-for-byte as the author wrote it. No new test is needed for prose.


* Remove the pull request description's stale "six behavior specs" claim, which lists and changes seven spec files.

Existing Issue: The pull request body says "The six behavior specs were reconciled with this routing" while parenthetically listing seven files (acp.md, acp-records.md, connection.md, connections-tab.md, editor-tab.md, monitoring.md, roles.md), and the aggregate diff changes all seven product/specs files; the original ready plan named six, with acp-records.md added later. Severity: 2/10

Existing Risk: 3/10 - A reviewer relying on the change-set count miscounts the reconciliation scope and may overlook that acp-records.md was also updated, or simply trusts a statistic the diff does not support.

Proposal Risk: 1/10 - Removing the number leaves the enumerated file list intact, so the only residual risk is a marginally less precise sentence, which the following file list resolves on its own.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2185 "remove the stale behavior-spec count from the pull request description". Edit only that sentence of the pull request body to drop the count, for example "The behavior specs were reconciled with this routing (...)", leaving the parenthesized file list exactly as written and every other paragraph byte-for-byte unchanged. Per the change-set-statistic rule, remove the wrong count rather than replacing it with seven. Do not change the title, any source file, spec, or any other description text. Verify with gh pr view 2185 --json body that no "six behavior specs" wording remains, that the file list and all other paragraphs are intact, and that the pull request is still OPEN.
