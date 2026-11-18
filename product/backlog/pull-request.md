<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Reconcile the remote spec's stale claim that no command exposes run clones with the subagent command that uses them.

Existing Issue: The Run clones section closes by saying an open or resolution request may name a ready clone with a workspace selector but no launcher or command exposes the service for a run yet, while this same change ships the subagent command that provisions and releases a run clone over the channel for every remote run. Severity: 5/10

Existing Risk: 5/10 - A reviewer or future maintainer reading the remote spec concludes the run-clone frames are unused scaffolding, under-scrutinizes the remote subagent clone lifecycle, or later removes the service as dead code while the command still depends on it.

Proposal Risk: 2/10 - The spec then agrees with the code and the sibling subagent spec, the change is prose only, and no runtime hazard remains; the only residual risk is a future edit reintroducing a similar stale claim.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2064 "reconcile the remote spec's stale claim that no command exposes run clones". In product/specs/remote-server.md, find the Run clones section's closing sentence stating that an acp-open or agent-resolve request may name a ready clone with a workspace selector but no launcher or command exposes the service for a run yet. Replace that last clause with a statement that the subagent command is the command that provisions and releases a run clone for each remote subagent run, and that acp-open and agent-resolve select that clone by its label for spawn, confinement, and task resolution. Cross-check product/specs/subagent.md's Remote clone lifecycle section and src/subagent/launch.ts and src/remote/serve-run-clones.ts so the wording matches the shipped behavior. Change no code, frames, protocol version, or command behavior. The spec has no automated test; verify by re-reading the section and confirming it no longer denies that a command uses the service.


* Correct the plan's stale claim that the tell grant count started at fourteen rather than the actual seventeen.

Existing Issue: The plan's Specs and docs section says the tell grant count moves from fourteen to eighteen in three help and spec files, but those files carried seventeen native commands before this change, as both the diff and the count-correction fix plan show. Severity: 2/10

Existing Risk: 2/10 - A reader reconciling the plan against the specs gets a wrong baseline for the native vocabulary and may misjudge how the count evolved across the rebased subplans.

Proposal Risk: 1/10 - The corrected number matches the diff and the fix plan, and the edit is confined to one word in a planning document, so no behavioral risk remains.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2064 "correct the plan's stale fourteen-command baseline". In product/plans/complete/subagent.md, locate the Specs and docs bullet naming the tell help page and the roles specs that says the grant count goes from fourteen to eighteen. Change fourteen to seventeen so the stated baseline matches the actual pre-change text in those files and the eighteen-command target already recorded in product/plans/complete/correct-stale-native-command-counts-in-subagent-specs.md. This is prose only: change no code, spec, help, or user-documentation count, all of which already say eighteen. Verify by reading the three named files at the base revision and confirming the prior count was seventeen.
