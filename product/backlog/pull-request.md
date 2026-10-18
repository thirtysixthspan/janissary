<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the pull request description's claim that its Files changed list names every area the diff touches, which omits the shared editor opener, and its failure list, which omits the oversized-runscript refusal.

Existing Issue: The description says its Files changed list names the areas the diff touches, yet that list omits the shared editor opener the latest repair changed, and its failure list in the Flow 7 section omits the oversized-runscript refusal that the scripts-tab spec now carries. Severity: 2/10

Existing Risk: 3/10 - A reviewer who scopes the read to the named areas misses a change to the shared editor opener, which the edit, open, and new-file paths all run through, so the one change with reach beyond the scripts tab gets the least attention.

Proposal Risk: 1/10 - Once the body names the opener and lists the refusal, the residual risk is that the body drifts from the diff again, which a re-read against the changed-file list catches.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1739 "name the shared editor opener and the oversized-runscript refusal in the pull request description". Change only the pull request body, leaving the title and every other paragraph as the author wrote them. Under the Server part of the Files changed section, add a bullet naming src/openers/editor.ts as the shared editor opener whose openInEditor now calls the exported editorSizeRefusal, and name its colocated test src/openers/editor.test.ts beside it. In the Flow 7 failure list, add the line `edit: <name>.rs is <size> — too large to edit in-app (limit <size>).` for Open, Enter, and Duplicate of a runscript above the editor's two-megabyte limit, noting that for Duplicate the name is the copy's, so the line matches the row in the Failure text table of product/specs/scripts-tab.md. Make no source change, because the refusal's behavior is already correct and pinned by src/openers/editor.test.ts and src/plugins/runscript-topic-actions.test.ts. Verify by reading the new body against git diff --name-only origin/master...HEAD, confirming every changed file that is neither a test nor a plan is named, and comparing the added line with the spec row.


* Correct the scripts-tab spec's account of how the plan's refresh lifecycle became a tick gate, whose stated reason rests on a claim the host does not support.

Existing Issue: The spec says the plugin API has no hook for a tab closing, so the refresh cannot learn that the last scripts tab has closed, yet the host emits a transcript tab:removed event when a tab is removed and the tabs topic reports closes to plugins, so the stated reason for dropping the plan's start and stop lifecycle is false. Severity: 3/10

Existing Risk: 3/10 - A maintainer who trusts the stated reason may build a plugin-API change or a polling workaround for a limit that does not exist, or may not realize the gate is a choice that a lifecycle could replace.

Proposal Risk: 1/10 - Once the spec states the real basis for the gate, the residual risk is the one-second lag and the per-tick scan of open tabs, which the spec already describes as negligible.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1739 "state the real basis for the scripts refresh being a tick gate". In the Live list and refresh section of product/specs/scripts-tab.md, keep the gate as the decision and rewrite the paragraph that begins "The refresh is a gate, not a lifecycle" so that it drops the sentence saying the plugin API has no hook for a tab closing and the sentence saying the refresh cannot learn that the last tab has closed. Replace them with the accurate basis: the host observes tab removal through the transcript tab:removed event that src/tab/cleanup.ts emits, so a start and stop lifecycle was possible, and the gate is kept as a cost choice, because a start and stop pair would need a tab:removed subscription kept in step with the first scripts tab opening, while the gate reads the open tabs on each tick and needs no such bookkeeping. Leave the completed plan product/plans/complete/scripts-tab.md as the historical record, and note in the spec that the plan's activate-level start and stop test is replaced by the gate tests. Make no code change, since src/schedule/system/runscript-refresh.test.ts already pins the gate's admit, clear, and dispose behavior. Verify by re-reading the rewritten paragraph against src/tab/cleanup.ts, the tabs topic in src/plugins/topics.ts, and src/schedule/system/runscript-refresh.ts.
