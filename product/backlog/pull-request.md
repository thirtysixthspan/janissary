<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the scripts-tab spec's account of how the plan's refresh lifecycle became a tick gate, whose stated reason rests on a claim the host does not support.

Existing Issue: The spec says the plugin API has no hook for a tab closing, so the refresh cannot learn that the last scripts tab has closed, yet the host emits a transcript tab:removed event when a tab is removed and the tabs topic reports closes to plugins, so the stated reason for dropping the plan's start and stop lifecycle is false. Severity: 3/10

Existing Risk: 3/10 - A maintainer who trusts the stated reason may build a plugin-API change or a polling workaround for a limit that does not exist, or may not realize the gate is a choice that a lifecycle could replace.

Proposal Risk: 1/10 - Once the spec states the real basis for the gate, the residual risk is the one-second lag and the per-tick scan of open tabs, which the spec already describes as negligible.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1739 "state the real basis for the scripts refresh being a tick gate". In the Live list and refresh section of product/specs/scripts-tab.md, keep the gate as the decision and rewrite the paragraph that begins "The refresh is a gate, not a lifecycle" so that it drops the sentence saying the plugin API has no hook for a tab closing and the sentence saying the refresh cannot learn that the last tab has closed. Replace them with the accurate basis: the host observes tab removal through the transcript tab:removed event that src/tab/cleanup.ts emits, so a start and stop lifecycle was possible, and the gate is kept as a cost choice, because a start and stop pair would need a tab:removed subscription kept in step with the first scripts tab opening, while the gate reads the open tabs on each tick and needs no such bookkeeping. Leave the completed plan product/plans/complete/scripts-tab.md as the historical record, and note in the spec that the plan's activate-level start and stop test is replaced by the gate tests. Make no code change, since src/schedule/system/runscript-refresh.test.ts already pins the gate's admit, clear, and dispose behavior. Verify by re-reading the rewritten paragraph against src/tab/cleanup.ts, the tabs topic in src/plugins/topics.ts, and src/schedule/system/runscript-refresh.ts.
