# Order remote search results by path

**Complexity: 4/10** — keep the remote search's eight concurrent file reads while consuming matches in the file-list order already specified by the search tab.

## Goal

Remote search currently appends rows when each worker finishes reading a file. Read latency therefore changes the visible order and can cause the 250-row cap to retain later paths while dropping earlier matches. Remote results must follow file path and line order, with the cap applied to that ordered result stream.

## Approach

Keep at most eight candidate reads in flight, indexed by their position in the sorted `listProjectFiles` result. Consume each read in index order and append its matching rows before moving to the next path; stop scheduling further reads when the ordered result count reaches 250. Allow `searchText` to receive a candidate reader so a test can deliberately delay an earlier path while later reads complete.

## Implementation steps

1. Update `src/file-navigator/search-text.ts` to schedule bounded concurrent reads and consume them in candidate order, applying the cap as ordered rows are accepted.
2. Add a controlled-delay test to `src/file-navigator/search-text.test.ts` that proves a later path completing first cannot move ahead of an earlier path and that the cap selects the first 250 rows by path and line.
3. Keep the existing search spec as written because `product/specs/search-tab.md` already promises file-path-then-line ordering and a cap applied in listed order. Move this plan from `draft/` to `ready/` before implementation and to `complete/` after implementation.

## Tests

- The delayed earlier file is returned before later files that finish reading sooner.
- With more than 250 matching rows across files, the returned rows are exactly the first 250 by path and line, even when the first path is slower.
- Existing tests for include and exclude filters, binary and oversized file skips, within-file line order, the 250-row cap, and an empty query continue to pass.
- Run `./scripts/run.mjs check-diff` after the implementation, the tests, and plan/backlog changes.

## Spec and documentation

No spec or public documentation edits are needed; the existing search spec already describes the required ordering and cap behavior.

## Out of scope

Changing local search behavior, remote result streaming, the remote request protocol, query matching rules, or the 250-row limit.
