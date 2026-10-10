<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's promised one-click command launch from the rail.

Existing Issue: The plan says clicking a command row launches its feature, but `CommandRail.tsx` only dispatches after the already-selected row is clicked again, and the client tests encode that two-click behavior. Severity: 5/10

Existing Risk: 5/10 - Users following the documented click interaction select a command without launching it, making the rail appear unresponsive and leaving its activation behavior inconsistent with the tab rows and the plan.

Proposal Risk: 2/10 - A first-click activation could make accidental launches easier, but focused interaction tests and explicit behavior in the rail keep the tradeoff visible and consistent.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1627 "deliver the planned one-click command launch from the rail". Update `web/src/plugins/launcher/CommandRail.tsx` so a pointer click on a command row dispatches that row immediately while preserving arrow-key selection and Enter activation. Update the interaction cases in `web/src/plugins/launcher/LauncherTab.test.tsx` to assert a single click dispatches the exact configured line, including the `tasks` and `hist` application-handled commands, and retain coverage that Enter activates the selected row. The plan and `product/specs/launcher.md` already describe click-to-run, so keep those promises aligned with the implementation.
