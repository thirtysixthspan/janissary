<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Align the pull request description and feature plan with the remote-host search implementation.

Existing Issue: The pull request body and the main feature plan say remote search transfers each candidate file for local matching with no protocol change, but this diff adds the `search-text` remote filesystem operation and performs matching on the remote host; the main plan also says the capability count rises to forty-six while the host declares forty-seven. Severity: 5/10

Existing Risk: 5/10 - Reviewers and future implementers are given the wrong architecture and performance tradeoff, and may build on the obsolete per-file transfer path or overlook the extra capability.

Proposal Risk: 2/10 - The intent documents will match the shipped host-side scan and its single capped response, while the completion-time wait for remote results remains part of the design.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1760 "align the remote search description and feature plan with host-side matching". Update the remote-search architecture paragraph in the pull request body to describe the `search-text` operation, matching on the remote host, and returning capped matching rows in one completed response. In `product/plans/complete/search-tab-should-search-in-local-and-remote-workspaces.md`, replace the stale local-transfer decision and the remote `scopeFileAccess` and capability descriptions with the implementation delivered by `product/plans/complete/remote-search-runs-on-host.md`; include `remoteWorkspaceSearch` in the capability description and correct the stated total to forty-seven. Keep the remote plan's explicit non-streaming tradeoff and the already-correct behavior in `product/specs/search-tab.md`. The existing `src/plugins/documentation.test.ts` checks the declared capability count against the developer documentation and must continue to pass.


* Preserve path order and the earliest matches in remote workspace search.

Existing Issue: `src/file-navigator/search-text.ts` lets eight workers append rows as reads finish, so remote rows can arrive in a different order from the sorted file list and the shared 250-row cap can retain later paths while dropping earlier matches, contrary to `product/specs/search-tab.md`'s file-path-then-line ordering and cap semantics. Severity: 6/10

Existing Risk: 6/10 - Remote searches can show inconsistent row order and omit the first matches in path order when slower files finish after later files, making capped results unreliable in ordinary repositories.

Proposal Risk: 2/10 - Ordered consumption will make remote rows and the 250-row cutoff deterministic, while the remote scan will still return its capped result set only after the operation completes.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1760 "preserve path order and the earliest matches in remote search". In `src/file-navigator/search-text.ts`, keep the bounded concurrent candidate reads but retain each result by its index in the `listProjectFiles` output and consume matching rows in that order, applying `SEARCH_MAX_RESULTS` only as ordered rows are accepted. Add coverage in `src/file-navigator/search-text.test.ts` with controlled read delays proving that a later path completing first does not move ahead of an earlier match and that the cap selects the first 250 rows in path and line order. Keep the existing include/exclude, binary-file, size-limit, and result-cap cases intact; `src/plugins/search/scan.test.ts` continues to cover the local scan's existing ordered behavior.
