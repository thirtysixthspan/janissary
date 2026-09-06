# Keep the scratch directory of a browser that died

**Complexity: 2/10** — one branch in one function. The distinction it turns on is already a parameter of that function, and the directory's outer lifetime is already owned by the startup sweep.

## Goal

A browser that dies leaves its scratch directory behind to be read.

Today it does not. `stopSession` (`src/browser/e2e-session.ts`) calls `release()`, and `release` calls `session.scratch?.remove()` on every path through it — the user closing the tab and Chromium dying on its own are treated identically. Chromium's user data directory, its temp sibling, and any crash dump it managed to write all live inside that pair, so all of it is `rmSync`'d milliseconds after the death, before anyone has been told there was one.

That is the second half of the diagnostic gap the deferred issue in `product/backlog/issues.md` records: the report now names how the browser went, and this leaves the state it went in.

## Approach

`stopSession` already distinguishes the two cases, because it already has to: a `message` means the browser is gone for a reason the user did not ask for, and no message means the user closed the tab. That same parameter decides whether the scratch survives. Nothing new has to be tracked and no caller changes.

Everything else in `release` is unchanged, and deliberately. The guard still closes, the child is still killed, and the ports are still given back — a kept directory is evidence, not a browser still running, and holding two ports out of the band to preserve a directory would cost a later launch a browser.

The kept directory lives until janissary next starts, and no teardown removes it after the fact. `clearWorkspaceDir` sweeps every direct child of the workspace root at startup and the browser scratch container is one of them (see `e2e-scratch.ts`), so the lifetime is already bounded without anything new to expire it. The alternative — removing it when the user closes the now-dead tab — reads plausible and defeats the whole change: closing that tab is the first thing a user does after being told the browser is gone, and the post-mortem would be swept away by the reflex that follows reading about it.

## Implementation steps

1. `src/browser/e2e-session.ts` — give `release` a `keepScratch` parameter, skip `session.scratch?.remove()` when it is set, and pass `message !== undefined` from `stopSession`. Update the module's header comment, which currently says a failure part-way through setup gives back exactly what it took.
2. `src/browser/e2e-server.ts` — correct the `E2EBrowserHandle.close` comment, which says the close removes the browser workspace and that a browser which already ended has released all of that itself. Neither is true of the scratch directory now.
3. `product/specs/harness.md` — the paragraph on what a browser that ends on its own releases currently names the scratch directory among them.
4. `documentation/user-documentation/advanced-agents/harness.md` — the same claim, and where to find a kept directory.

## Tests

- `src/browser/e2e-server-lifecycle.test.ts`: a child that exits unexpectedly keeps its scratch directory while still closing the guard, killing the child, and returning its ports; a child that never starts keeps it; a guard that cannot listen keeps it; a spawn that throws keeps what it allocated. A close the user asked for still removes it, and still removes it exactly once when the child's exit follows — but a close *after* an unexpected exit does not bring the removal back, which is the case the whole change turns on.

## Out of scope

- Naming the kept directory in the report. The message crosses the remote transport to a client that cannot open a path on the far host, and the notification would then carry a directory the reader has no way to reach.
- Expiring kept directories, capping how many accumulate, or sweeping them on any schedule of their own. The startup sweep already bounds them to the deaths of one session.
- Anything about what Chromium writes into that directory — crash dumps, `ulimit`, or its own logging are all launch-time configuration and a separate change.
- The scratch allocation itself, its container, or the slug that names it.
- Restarting or replacing a browser that died, which the deferred issue is explicit comes after the repro.
