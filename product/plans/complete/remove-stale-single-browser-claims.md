# Remove the stale single-browser and next-connect-fails claims

**Complexity: 2/10**. Prose and comments only, in nine places. The risk is writing a new rationale that is also wrong, so each rewrite is read against the restart paragraphs of the harness spec.

## Summary

The connect-triggered restart made two old rationales untrue, and both are still written down.

Five places say a tab's browser "is the only one that tab will ever get": `product/specs/harness.md`, `product/specs/sandbox.md`, the user documentation's harness page, `ai/guidelines/sandbox-e2e-browser.md`, and the comment in `src/browser/e2e-frame-filter.ts`. Four places justify the gone-browser band by "the agent whose next connect is about to fail": `product/specs/harness.md`, `product/specs/notifications.md`, `src/harness/browser-gone.ts` and `src/remote/manager-reports.ts`. And `src/browser/e2e-spawn.ts`'s header still speaks of "both the eager and the on-demand start sequences" after the two were collapsed into one.

The agent-facing guidelines contradict themselves within one page. The teardown bullet says the browser is the only one the tab will ever get, while "When it stops working" says to connect again for a fresh one.

## Design decisions

1. **The teardown refusal keeps its rule and gets an honest reason.** The browser still belongs to the tab rather than to the guest. What a script could do by closing it is no longer to spend the tab's only browser. It would force a restart that counts against the tab's restart budget. So the rationale says the browser is the tab's, and that a browser a script could close is one the tab would have to restart and count against that budget.

2. **The band's rationale is who is working in the tab, not what their next connect will do.** A connect after a death now starts a fresh browser rather than failing, so the band is justified by the agent that was driving the browser working in that tab. That is still why a notifications line alone is not enough.

3. **The spawn header names the one sequence.** `e2e-spawn.ts` is used by the one start sequence in `e2e-server.ts`. Its header says so rather than naming two.

## Proposed changes

1. **`product/specs/harness.md`.** Rewrite the protocol-guard paragraph's "it is the only one that tab will ever get, so no script can spend it" per decision 1. Rewrite the band paragraph's "the agent whose next connection attempt is about to fail" per decision 2.
2. **`product/specs/sandbox.md`.** Rewrite the teardown paragraph's "it is the only one that tab will ever get" per decision 1.
3. **`product/specs/notifications.md`.** Rewrite the `e2e-browser-gone` entry's "the agent whose next connection is about to fail" per decision 2.
4. **`documentation/user-documentation/advanced-agents/harness.md`.** Rewrite the containment warning's "can't spend the one browser its tab will ever get" per decision 1, in user terms: the browser belongs to the tab, so a script can't close it out from under the tab. The user documentation does not describe the restart budget, so this page does not bring it up.
5. **`ai/guidelines/sandbox-e2e-browser.md`.** Rewrite the "You ask for the browser itself to be closed or killed" bullet per decision 1.
6. **`src/browser/e2e-frame-filter.ts`.** Rewrite the comment above the teardown methods per decision 1.
7. **`src/harness/browser-gone.ts` and `src/remote/manager-reports.ts`.** Rewrite the band rationale in each header comment per decision 2.
8. **`src/browser/e2e-spawn.ts`.** Correct the header per decision 3.

## Tests

None added. There are no behavior changes. `src/browser/e2e-frame-filter.test.ts` and the harness browser-gone suites must keep passing untouched. Verify with a grep across `product/specs`, `documentation`, `ai/guidelines` and `src` for "will ever get", "about to fail" and "eager and the on-demand", expecting no hit that describes the e2e browser.

## Out of scope

- No change to what the guard refuses, to the band, or to the restart budget.
- Other files whose wording is accurate.

## Verification

`./scripts/run.mjs check-diff` and the grep above.
