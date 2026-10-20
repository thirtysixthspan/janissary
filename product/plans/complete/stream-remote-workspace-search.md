# Stream remote workspace search results

**Complexity: 4/10** — one remote-only scan path with focused coverage; no remote protocol or plugin API change.

## Goal

Show remote workspace matches as soon as any matching file has been read, without waiting for earlier paths or every file in the current 64-file batch. Read each remote candidate once so matching files are not fetched again to build their result rows.

## Approach

The general scan uses two phases to prioritize matches: read a batch, identify files that match, then read matching files again to build rows. That adds a batch barrier and duplicate remote reads on the SSH path. Keep that strategy for local scans. For remote scans, where `readCandidate` is provided, keep up to eight candidate reads active and build rows from each file's content as soon as its read completes. This avoids waiting for a slow earlier path and avoids extra channel round trips.

Keep the remote filesystem request deadlines unchanged. A finite timeout is not a fix for slow search results.

## Implementation steps

1. Add a remote-only scan path that reads each candidate once, keeps at most eight reads in flight, streams rows as each read completes, and stops at the existing 250-result cap.
2. Add tests proving a remote match is published while earlier paths remain pending, candidate files are read once, cancellation stays silent, and the result cap still settles correctly.
3. Restore the remote search request's long deadline and remove timeout-only behavior and documentation from the earlier attempt.
4. Update the search spec to describe remote first-result streaming accurately.

## Tests

- A matching first remote candidate publishes rows while later reads in the batch are still pending.
- Every candidate used to build rows is read once.
- Remote result rows preserve each file's line order, and the existing cap and cancellation behavior still hold.
- An unanswered remote `search` request retains its long deadline.

## Out of scope

- Changing local scan prioritization or its read strategy.
- Changing remote request deadlines.
- Moving matching onto the remote host or adding a remote filesystem protocol operation.
