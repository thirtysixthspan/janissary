<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's gone-tab title test so it actually shows the walk dialog's title switching from the tab's full name to its label when the tab disappears.

Existing Issue: The quit-walk test for a tab removed while its dialog is open uses a bare `alpha` tab whose full name already is its label, so the title reads `walkTitle('alpha')` both before and after removal and the test cannot observe the change to the label fallback that the plan's named test promises. Severity: 3/10

Existing Risk: 3/10 - A later edit that keeps showing a vanished tab's stale full name, or that resolves the title from a captured tab instead of the live list, would pass the suite unnoticed, leaving the walk dialog naming a file that no longer has a tab.

Proposal Risk: 1/10 - The test pins the fallback transition directly; what would still go unseen is a regression in how `tabFullName` orders editor name, title, and label, which its own tests already cover.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1957 "make the quit-walk gone-tab title test prove the switch from full name to label fallback". In `web/src/unsaved-work/CloseSaveGuard.quit-walk.test.tsx`, change the test "falls back to the label when the current tab disappears before it is answered" so the walked tab has a full name different from its label, for example `tab('alpha', { title: 'Readme' })` or an `editor` override with `name: 'notes.md'` like the existing full-name test uses. Assert that `walkTitle('Readme')` (or `walkTitle('notes.md')`) is shown after `startWalk`, then call `h.setTabs([])` and assert that `walkTitle('alpha')` is shown, that the full-name title is gone (`queryByText(walkTitle('Readme'))` is null), and that the `alertdialog` is still mounted. Do not change `web/src/unsaved-work/useQuitWalk.ts`. Its `title` computation (`walkTitle(quitTab ? tabFullName(quitTab) : request.label)`, with `quitTab` resolved from the live `tabs`) already does what the plan describes, so this is a test-only change. Verify by running the diff-scoped web tests. The rest of `CloseSaveGuard.quit-walk.test.tsx`, `CloseSaveGuard.test.tsx`, and `save-walk.test.ts` must keep passing unchanged.
