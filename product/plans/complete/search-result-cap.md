# Cap a Search at 250 Results

**Complexity: 3/10** — a counter threaded through the scan's two phases in `src/plugins/search/scan.ts`, a stop condition in its loop, scan tests, and a spec change. No wire or client change.

## Goal

A search should stop at 250 results. Today a scan runs until it has read every candidate file, so a common term in a large project streams thousands of rows into the tab, keeps reading the disk long after the window is full, and republishes the whole growing payload on every batch. Once 250 rows have been delivered the scan should settle as done and read nothing more.

## Approach

Count in the scan, not in the session. The scan is what reads the disk, so stopping there is what actually ends the work. Truncating in `SearchSession.receive` would hide the extra rows but leave the scan reading every file to the end.

`MAX_RESULTS = 250` sits beside the scan's other literals. The scan's `Runtime` gains a `remaining` count that starts at `MAX_RESULTS`:

- **Phase two** (`deliver`) slices each file's rows to `remaining` before handing them to `onBatch` and subtracts what it sent. A file whose matches straddle the cap contributes only the rows that fit, in line order, so the 250 delivered are exactly the first 250 in path-then-line order. When `remaining` reaches zero, `deliver` returns without reading the rest of its queue.
- **The loop** (`run`) stops taking new batches once `remaining` is zero, and then reports `done` through the same final `onBatch({ rows: [], done: true })` a scan that ran out of files uses. A capped scan is a completion, not a failure and not a cancellation, so it settles in the ordinary `done` state and the tab stops showing **Searching…**.

Nothing needs to reach the client. The payload already streams rows and a `done` state, and the cap changes only how many rows arrive before `done`. The spec's "no tally" stance stays: the tab shows the rows and nothing else.

## Implementation steps

1. **The cap.** In `src/plugins/search/scan.ts`, add `const MAX_RESULTS = 250;` with a comment saying why the scan, not the session, enforces it. Add `remaining: number` to `Runtime` and initialise it to `MAX_RESULTS` in `startScan`.
2. **Delivering.** In `deliver`, stop when `runtime.remaining` is zero. Slice each file's rows to `remaining`, subtract the delivered count, and send the batch only when it holds rows.
3. **The loop.** In `run`, break out of the batch loop once `runtime.remaining` is zero, before detecting another batch, so the final `done` batch follows immediately.

## Tests

In `src/plugins/search/scan.test.ts`:

- A project with more matching files than the cap delivers exactly 250 rows, the first 250 in path order, followed by exactly one `done`.
- A single file with more matching lines than the cap delivers its first 250 lines and settles as done.
- A file whose matches straddle the cap contributes only the rows that fit.
- Once the cap is reached, files after it are never read: with 400 matching files, the files in the batches past the one that filled the cap are not read.
- A search with fewer matches than the cap is unchanged; the existing 200-file streaming test covers that and must keep passing.

## Spec

`product/specs/search-tab.md`, "The results": replace "There is no cap and no tally" with a statement that a search stops at its first 250 matches, in the order the results are listed, and settles as finished. The header still shows no count.

## Out of scope

- Showing that the cap was reached, or offering to load more. The entry asks for the search to stop, not for a new state.
- Making the cap configurable.
- The remaining entries in the pull request's backlog.
