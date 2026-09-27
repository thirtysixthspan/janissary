# Enforce the dataset ceiling, and drop the datasets nothing reads

`MAX_DATASETS` was declared, used by the store's record guard, and never enforced on the way in. `isDatasetList` refuses a list longer than the ceiling, so a ninth dataset is not merely wasted work: the record cannot be read back, the visualization drops out of the index, and all the user is left with is a warning on stderr. A reply naming fifty files could reach it, because `place` acquired each file's data *before* the chart-ceiling check refused the chart, and nothing dropped a dataset whose last chart had been removed — so the ceiling closed only as the user removed charts by hand.

Three changes, each making the bound mean what the guard already assumed:

- `ensureDataset` in `src/visualizations/charts.ts` refuses to create a ninth, and says so in a comment rather than leaving the reader to work out why the number matters.
- `place` in `src/visualizations/agent.ts` cuts a reply at the room the record has left rather than refusing it whole — the charts that fit are what was asked for — and checks a new data reference against the ceiling *before* the read, so a reply naming fifty files does not spend the budget on charts about to be refused. The message says how many did not fit and how many sources there are.
- `pruned` drops a dataset no chart draws from once a removal lands, which is what keeps the ceiling a bound on what is in use rather than on what has ever been named. The source placeholder is exempt: it is what a later message re-reads, and the model was shown that data.

`acquire` in `src/visualizations/reading.ts` no longer casts the result of `ensureDataset` to a dataset it might not have been, and returns nothing instead: the chart keeps the table it had rather than a reference to one that does not exist.

`src/visualizations/agent.test.ts` gains a case cutting a nine-chart reply, a case proving the ninth source is refused with no read attempted, and a case proving an orphaned dataset is dropped. `src/visualizations/reading.test.ts` covers the ceiling at the read itself. The existing chart-ceiling case now reads as one of two rather than the only one.
