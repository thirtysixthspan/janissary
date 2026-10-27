<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the technical debt in the tab guide's claim that docked tabs always return within their group after undocking.

Existing Issue: The tab guide says a docked tab returns to its reordered position in its group, while a visible docked tab can be moved in sidebar order across groups and keeps that full-array position when undocked. Severity: 3/10

Existing Risk: 4/10 - Users can follow the guide, move a docked tab, then find it outside its group's center run after undocking and assume the command or tab order is broken.

Proposal Risk: 1/10 - Clarifying the retained full-array position removes this expectation mismatch, though other prose about sidebar ordering could still be stale.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1802 "correct docked tab return-order guidance". Update the sidebar section in `documentation/user-documentation/getting-started/tabs.md` to say an undocked tab normally returns at its retained strip position, but a visible docked tab reordered with `tab move` keeps its full-array position and can return outside its group's center run. Match the behavior already documented in `product/specs/sidebars.md` and `documentation/user-documentation/getting-started/groups.md`, and verify the sentence no longer promises group-relative ordering after a docked move.
