<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Align the final description and summarizer documentation with the implemented lifecycle and tool policy.

Existing Issue: The PR body still names `gateOpen` and a length-only cursor, the primary plan retains obsolete last-entry timestamp and ACP-permission-only enforcement claims, and the ACP spec says a typed `acp` command runs the full tool table despite the tab's sticky restriction. Severity: 4/10

Existing Risk: 4/10 - A contributor can rely on an obsolete change detector or security enforcement point and undo fixes already present in the implementation.

Proposal Risk: 1/10 - Documentation can still drift later, but matching the runtime fields and enforcement point to existing regression tests makes the current boundary reviewable.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1627 "align final launcher documentation with incarnation-aware cursors and sticky tool restrictions". Update the live PR description to name `gateNeedsUser` and describe transcript revision plus length and tab incarnation as the summarizer's change and ownership facts. Reconcile contradictory paragraphs in `product/plans/complete/sidebar-launcher-tab.md`, including the obsolete claim that no runtime timestamp writer is needed and the claim that ACP-level permission denial alone makes the summarizer tool-less. State that `startAcp({ withoutTools: true })` records a tab-owned policy enforced by omitting the host tool table in `src/acp/manager.ts`. Correct `product/specs/acp.md` so a typed prompt on that restricted tab is also restricted until the tab closes. Keep runtime behavior unchanged and use the existing ACP policy, transcript-revision, and tab-incarnation tests as the documentation reference.
