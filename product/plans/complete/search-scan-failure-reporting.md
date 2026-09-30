# Report a Failed Search Instead of Leaving the Tab Searching

**Complexity: 2/10** — one error field on the batch channel, one rejection handler, one branch in the session, and three test cases. The client already renders the state; nothing new is drawn.

## Goal

When the search tab cannot read the project, it must say so. Today `startScan` begins the scan with `void run(runtime)` and `run` awaits `options.listFiles()`, so a rejected file list escapes as an unhandled promise rejection while the tab sits in its `searching` state forever — no rows, no message, and nothing on screen to tell the user why. The plan and `product/specs/search-tab.md` both promise a third body state showing the reason a search fails, and `ResultTable` already renders it.

A silent hang is the worst of the three states the spec describes: `Searching…` reads as "still working", so a user waits on a scan that has already failed.

## Approach

Add a failure to the batch channel the scan already publishes on, and handle it where the payload is assembled. The session turns it into the `error` state the payload type and the client's table already understand.

The rejection handler must also not fire for a scan the user themselves cancelled. A cancelled scan is a normal outcome, not a failure, and reporting it as an error would put a red line on screen for work the user asked to abandon.

## Implementation steps

1. **A failure on the batch channel.** In `src/plugins/search/scan.ts`, `ScanBatch` currently carries `rows` and `done`. Add an optional `error?: string` carrying a one-line reason, distinct from `done`, so a failure and a completion are never conflated. Keep `done` meaning "the scan settled having found what it was going to find".

2. **Handle the rejection where the scan starts.** `startScan` calls `void run(runtime)`. Attach a rejection handler that reports the failure through `onBatch` as `{ rows: [], error: reason }`, and only when the scan was not already aborted — `runtime.signal.aborted` is the discriminator, and it is already threaded through everything the scan does. Reduce the reason to a single line with no stack, the same shape the plugin failure path uses.

3. **Make the final batch honest about cancellation.** `run` already ends with `if (!signal.aborted) options.onBatch({ rows: [], done: true })`, so a cancelled scan reports nothing. Keep that, and make sure the new handler in step 2 observes the same condition so the two cannot disagree — a cancelled scan must produce no batch at all.

4. **Turn the failure into the error state.** In `src/plugins/search/session.ts`, `receive` currently appends rows and sets `state: 'done'` when `done` is true. When a batch carries an `error`, set `state: 'error'` and put the reason in `message` instead, appending no rows. The `SearchState` union and the `message` field in `src/plugins/search/shared.ts` already declare this, and `ResultTable` in `web/src/plugins/search/ResultTable.tsx` already renders `state === 'error'` as a one-line body message, so no client change is needed.

## Tests

- `src/plugins/search/scan.test.ts`: a `listFiles` that rejects produces exactly one batch carrying the error, and no `done: true` batch. A scan cancelled before its file list answers produces no batch at all and no error.
- `src/plugins/search/activate.test.ts`: a scan whose file list rejects leaves the tab in the `error` state with the reason in `message`, and no rows. The existing cases asserting a settled scan reaches `done` with its rows must keep passing unchanged.
- No client test is needed: `SearchTab.test.tsx` already renders a hand-built `error` payload and asserts the message appears, and that test becomes reachable rather than synthetic once the server can produce the state.

## Out of scope

- Reporting a failure from anywhere other than the scan's own promise. A plugin capability that throws is the host's failure path and is not this.
- Retrying a failed scan, or distinguishing one failure kind from another in the message. One line saying what went wrong is the whole of it.
- The plan-fidelity follow-up that checks whether `SearchSession.current` is read anywhere. That is a separate entry and is not touched here.
