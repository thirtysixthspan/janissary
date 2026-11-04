<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Technical debt: share the record window size with the existing ACP record window constant instead of declaring a second 20 in the connections topic actions.

Existing Issue: `src/plugins/connections-topic-actions.ts` declares a local `PAGE_SIZE` of 20 for both the initial `load` request and each `loadOlder` increment while `src/acp-records/model.ts` already owns that same value as `ACP_RECORD_WINDOW_SIZE`, and no compile-time or test link ties the two, so a future change to the record window default leaves the topic paging at the old size. Severity: 2/10

Existing Risk: 2/10 - The next record-window change has two places to update with nothing that notices a mismatch, and the record tab can open a different number of blocks from the constant the record service documents.

Proposal Risk: 1/10 - The action and the record model share one exported constant, the current behavior remains 20, and the existing paging tests continue to pin the increment.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "share the ACP record window size in the connections topic actions". In `src/plugins/connections-topic-actions.ts`, import `ACP_RECORD_WINDOW_SIZE` from `../acp-records/model.js` and remove the local `PAGE_SIZE` declaration, using the imported constant for `load`'s initial request and `loadOlder`'s increment. Keep the action list, ordering, owner validation, and record-window projection unchanged, and preserve any zero-total or `hasOlder` guard already present in the branch. Extend `src/plugins/connections-topic.test.ts` to assert that a loaded window's count equals `ACP_RECORD_WINDOW_SIZE` and that one `loadOlder` grows it by that constant, so a future change to the record constant is followed by the topic. Do not change `src/acp-records/model.ts`, `recordWindow`, the protocol types, or any user-facing behavior; run the focused server suite and `$janissary/scripts/run.mjs check-diff`.
