# Count the other values a fence notice is about correctly

`outliers` in `src/visualizations/insights.ts` said "the middle half of the ${values.length - 1} other ${chart.y} values occupies", computing "other" as one less than the total however many rows were outside the fences. With one finding that is right, and it is the only case the test pinned — which is why a figure a reader is invited to check was wrong by the number of other findings and nothing said so. The by-service case names two rows and said seven other values out of eight, where the fences were judged over the six inside them.

The count is now the values inside the fences — `values.length - outside.length` — because that is the group the middle half was taken of, and the sentence is about the rows that were not. It is the same arithmetic the `outside` filter already performed, so nothing new is computed.

Two cases move: the new three-spike series in `insights.test.ts` asserts "the middle half of the 9 other latency values" appears for each of the two named rows and that "the 11 other" wording is gone — it fails against the previous count, which said eleven. The by-service case's expected sentence moves from seven to six, which is the correction rather than a change of behaviour.
