# Report how much of a capped source a chart is showing

`resolve` set `total` to the transformed row count, so the two numbers a table carries could never differ. The caption under a chart — the only consumer of the field — could therefore only ever read "5 rows" or "showing 5 of 5 rows": the second branch existed, and its test asserted "showing 1 of 12043 rows", and no chart could produce it. A chart over a source of twelve thousand rows showed five hundred of them and said "500 rows", which is the omission `product/specs/visualizations.md` names when it says a cropped picture reading like a complete one is a chart lying by omission.

`resolve` in `src/visualizations/chart-spec.ts` now carries the source's own figures:

- `total` is how many rows the source held, not how many survived the transformations;
- `truncated` is the source's own flag, or a true when `total` exceeds the rows a chart is drawn from.

That second clause is what makes a `limit` report itself honestly at the caption as well as in the transformation notes below it: "showing 1 of 9 rows · the first 1 categories" says the same thing twice in two registers, which is the point — the caption is the one a reader sees without opening anything.

The spec sentence already described this behaviour, so it needed no correction: it was the code that did not do it.

`src/visualizations/chart-spec.test.ts`'s existing case is rewritten to assert the source's total survives beside one surviving row, and gains a case for a complete source, which pins the other half — a chart over nine rows out of nine still reads "9 rows" and not "showing 9 of 9 rows". The client caption test needed no change; it was correct and is now reachable.
