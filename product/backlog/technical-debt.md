# technical-debt

## ready

* `src/harness/manager.ts` duplicates a 12-argument positional parameter list for `spawnTab` (lines 154-158) between its two call sites, `open()` (line 127) and `openFromProfile()` (line 143) — several adjacent parameters share a type (`offline`/`autoApprove` both booleans, `model`/`effort` both optional strings), so a transposition of two adjacent args at either call site would compile silently. Introduce a `SpawnTabOptions` object to group these fields so the call sites can't drift out of argument-order sync. Severity: **medium**.

## development

## deferred

## declined
