# Bound remote workspace search waits

**Complexity: 3/10** — narrow deadline change with focused coverage in the remote request and search behavior tests.

## Goal

Ensure a remote workspace search that receives no file-list reply leaves `Searching…` and reports a useful error instead of waiting for the remote filesystem's ten-minute long-operation deadline.

## Approach

Remote workspace search is the only search-tab request that needs a complete remote file list before matching can begin. Give the remote filesystem `search` operation the ordinary 60-second request deadline. Keep genuinely long operations on the ten-minute deadline. The existing scan error path will publish the remote timeout reason in the search tab.

## Implementation steps

1. Remove `search` from the long-running remote filesystem operations and clarify the deadline comment.
2. Add coverage that a remote search request times out at the ordinary deadline and that the search tab publishes the resulting failure.
3. Update the search tab spec with the remote listing deadline and the visible timeout behavior.

## Tests

- Verify `requestDeadline('search')` is 60 seconds while other long-running operations retain the ten-minute deadline.
- Verify an unanswered remote search request rejects at 60 seconds with the existing remote timeout reason.
- Verify a rejected remote workspace listing settles the search tab with an error and does not leave it searching.

## Out of scope

- Changing deadlines for remote file reads or other filesystem operations.
- Interrupting the remote operation itself after the local request times out.
- Changing local search behavior or the search result matching deadline.
