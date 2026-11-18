<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the plan's stale claim that the tell grant count started at fourteen rather than the actual seventeen.

Existing Issue: The plan's Specs and docs section says the tell grant count moves from fourteen to eighteen in three help and spec files, but those files carried seventeen native commands before this change, as both the diff and the count-correction fix plan show. Severity: 2/10

Existing Risk: 2/10 - A reader reconciling the plan against the specs gets a wrong baseline for the native vocabulary and may misjudge how the count evolved across the rebased subplans.

Proposal Risk: 1/10 - The corrected number matches the diff and the fix plan, and the edit is confined to one word in a planning document, so no behavioral risk remains.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2064 "correct the plan's stale fourteen-command baseline". In product/plans/complete/subagent.md, locate the Specs and docs bullet naming the tell help page and the roles specs that says the grant count goes from fourteen to eighteen. Change fourteen to seventeen so the stated baseline matches the actual pre-change text in those files and the eighteen-command target already recorded in product/plans/complete/correct-stale-native-command-counts-in-subagent-specs.md. This is prose only: change no code, spec, help, or user-documentation count, all of which already say eighteen. Verify by reading the three named files at the base revision and confirming the prior count was seventeen.
