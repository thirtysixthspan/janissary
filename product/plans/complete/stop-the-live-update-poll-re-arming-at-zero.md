# Stop the live-update poll re-arming at zero after a read fails

A live-update chart whose source stopped answering hammered it. `applyRead` returned early on a failure without stamping the dataset, the poll computes its next wait as `Math.max(seconds * 1000 - (now - readAt), 0)`, and a dataset that failed was therefore due forever — so `poll` re-armed the timer at zero and issued another read as fast as the endpoint could refuse, committing a whole record on each one.

Three things came from the same root cause. A deleted record whose tab was still open polled forever, because `dueFor` read through `index.find` while every read it could ask for was refused through `index.live`. And a chart on agent-acquired data spun for the whole duration of every model call, because its `readAt` only advanced when the reply landed.

A failed attempt now stamps the time, so the next one is a full interval away — the poll measures from when a dataset was last *read*, not from when it last succeeded, which is the same rule it already applied to a slow read. `dueFor` reads through `index.live`, so a deleted record contributes nothing.

`src/visualizations/manager.test.ts` extends the existing re-read case to advance a further interval and assert no third attempt, and gains a case asserting a deleted record with an armed interval is never read again. `src/visualizations/reading.test.ts`'s failure case now pins the stamped time.
