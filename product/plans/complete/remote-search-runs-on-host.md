# Run remote workspace search on its host

Complexity: 8/10

## Goal

Run text matching on the machine that owns a remote workspace. Send only capped matching rows to the local UI instead of listing every path and transferring every candidate file.

## Approach

Move the pure matcher, path filters, and match-row contract into reusable search modules so local plugin scans and the remote filesystem operation share identical matching rules. Add a typed remote filesystem operation that lists, filters, size-checks, binary-checks, reads, and matches files on the remote host. Keep the existing 250-row cap and one-second matching deadline. Return the completed remote result set in one response; local and launch-directory searches keep their existing streaming behavior.

## Implementation steps

1. Extract matcher, path filtering, match-row types, and worker execution into reusable `src/search/` modules. Update search plugin imports and the plugin import-boundary allowlist with tests for the deliberate pure-helper exception.
2. Add a remote `search-text` filesystem operation and its request/result types, validation, decoding, implementation, and protocol-version update. The remote implementation will use the same gitignore-aware file list, include/exclude rules, editor size limit, binary-file check, match semantics, result cap, and worker deadline as the local search.
3. Add a remote-workspace search capability and route remote search scopes through it. Keep local and launch scopes on the current scan path; publish remote rows when the remote operation completes and suppress a late result after the local scan is cancelled or re-scoped.
4. Add focused tests for shared matching, server-side filtering and skips, remote protocol validation/result decoding, capability routing, error handling, and the unchanged local scan path. Run `./scripts/run.mjs check-diff` after each implementation step.
5. Update `product/specs/search-tab.md` to state that remote matching happens on the remote host and that its capped rows appear when that scan completes. Update the existing tab-plugin developer documentation and capability-count test for the added capability. Check `help.md` and existing user documentation for search behavior that needs correction.

## Tests

- Unit tests for shared matcher, filters, match rows, and remote search size/binary/result-limit behavior.
- Remote filesystem operation and frame codec tests for `search-text` arguments and results.
- Search session tests showing remote scopes use one remote search request and local scopes continue using local file reads.
- Run `./scripts/run.mjs check-diff` after every implementation step and after spec/backlog/plan changes.

## Out of scope

- Streaming remote result batches or adding a remote cancellation frame; the remote operation returns its completed capped result set.
- Changing local search ordering, result formatting, pattern syntax, or the search UI.
- Adding a persistent remote search index or caching results between queries.
