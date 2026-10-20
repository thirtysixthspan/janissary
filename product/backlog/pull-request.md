<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Preserve path order and the earliest matches in remote workspace search.

Existing Issue: `src/file-navigator/search-text.ts` lets eight workers append rows as reads finish, so remote rows can arrive in a different order from the sorted file list and the shared 250-row cap can retain later paths while dropping earlier matches, contrary to `product/specs/search-tab.md`'s file-path-then-line ordering and cap semantics. Severity: 6/10

Existing Risk: 6/10 - Remote searches can show inconsistent row order and omit the first matches in path order when slower files finish after later files, making capped results unreliable in ordinary repositories.

Proposal Risk: 2/10 - Ordered consumption will make remote rows and the 250-row cutoff deterministic, while the remote scan will still return its capped result set only after the operation completes.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1760 "preserve path order and the earliest matches in remote search". In `src/file-navigator/search-text.ts`, keep the bounded concurrent candidate reads but retain each result by its index in the `listProjectFiles` output and consume matching rows in that order, applying `SEARCH_MAX_RESULTS` only as ordered rows are accepted. Add coverage in `src/file-navigator/search-text.test.ts` with controlled read delays proving that a later path completing first does not move ahead of an earlier match and that the cap selects the first 250 rows in path and line order. Keep the existing include/exclude, binary-file, size-limit, and result-cap cases intact; `src/plugins/search/scan.test.ts` continues to cover the local scan's existing ordered behavior.
