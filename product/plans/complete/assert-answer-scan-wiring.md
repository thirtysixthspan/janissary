# Assert the answer scan reaches the delegating agent

**Complexity: 1/10** — one test case and a parameter on an existing stub; no source change.

## Goal

`scanWorkerAnswer` is unit-tested directly, so its own logic is pinned. What no test covers is that it is actually applied to the text a `msg` tool result carries: `runMsg` hands the worker's captured output to the scan before resolving, and a change that dropped that call would leave the scan's own tests green while every delegation returned unscreened worker text.

`pin-delegation-depth-cap` delivered the depth-cap cases and the three dispatch branches this entry's plan also named. The scan wiring is what remains.

## Approach

Give the `harness()` stub in `src/acp/delegation.test.ts` an optional reply string, defaulting to the plain text it uses today so every existing case is unaffected. Then one case: a worker whose captured output contains `<system-reminder>` resolves to a value beginning with the `[harness: neutralized …]` line, with the worker's own words still present underneath.

The assertion is on the promise `runMsg` resolves, not on `scanWorkerAnswer` directly — that is the wiring under test.

## Out of scope

- Screening `browser` and `db` tool results, which the plan defers as a separate surface.
- Any change to the scan's three categories.