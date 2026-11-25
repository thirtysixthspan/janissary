# issues

## ready

* Fix stale cross-subplan references in decompose-plan.md. Step 3 writes dependencies as product/plans/ready/server-log-per-run-N-*.md, but Step 6 promotes each subplan to complete/ as it lands. By subplan 4, those paths dangled, and I had to warn each subsequent implementation and spec subagent manually. Use stable filenames or final complete/ paths for dependency references, and have improve-plan.md Step 3 check forward references with promotion in mind.

## deferred

## declined
