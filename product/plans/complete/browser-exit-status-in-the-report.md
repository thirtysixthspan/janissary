# Report the exit status of a browser that died

**Complexity: 3/10** — two small call sites and one new pure module. No new architecture: the report path, the notification, and the child's stderr pipe all already exist, and this only puts something in them.

## Goal

When an e2e browser dies on its own, the report names how it died.

Today it cannot. `runE2EBrowser` (`src/browser/e2e-child.ts`) ends with `server.on('close', () => process.exit(0))`: the wrapper says nothing and exits `0` whether Chromium shut down cleanly, crashed, or was killed by the OS. The parent's `child.on('exit', () => stopSession(session, 'e2e browser exited'))` (`src/browser/e2e-server.ts`) discards the exit code and signal Node hands it. So a browser that was `SIGKILL`ed and a browser that ended cleanly produce the same notification — `e2e browser exited`, with the empty tail `withChildOutput` leaves when the child said nothing.

That message is the absence of a clue, not evidence of a graceful shutdown, and it is why the browser death recorded in `product/backlog/issues.md` under **deferred** cannot be diagnosed. After this change the report distinguishes the two, from both ends of the pipe:

```
e2e browser exited (signal SIGKILL)
chromium exited (signal SIGKILL)
```

against a clean shutdown:

```
e2e browser exited (code 0)
chromium exited (code 0)
```

## Approach

Two processes end here, and each knows something the other does not. The child watches Chromium and is the only one that can see *its* status; the parent watches the child and is the only one that still hears anything when the child dies too abruptly to speak. Report both, so a browser killed by the OS is distinguishable from a wrapper killed by the OS.

A new `src/browser/e2e-exit.ts` holds the shared formatting — `processEndDetail` turning a `{ code, signal }` pair into `code 1` or `signal SIGKILL`, `withEndDetail` appending it in parentheses, and `endedCleanly` for the one place a boolean is wanted. It is its own module rather than a helper in either file because both files need it and neither is the natural owner. Both sites then format identically, so the two lines of a report read as one thing.

`undefined` is the answer for a pair carrying neither, so a caller says nothing rather than saying `code null`. That is also what keeps the message exactly `e2e browser exited` when there is no status to add, which is the wording the spec, the user documentation, and the notification tests all already describe.

The child writes its line with `writeSync(2, …)` from `node:fs`, not `process.stderr.write`. Writes to a pipe are asynchronous on macOS — this is the documented platform difference, not a subtlety of this code — so a stream write followed immediately by `process.exit()` can lose the bytes it just queued, on exactly the path whose only job is to report something. The blocking `writeSync` puts them in the pipe before the process goes, and the parent's `ChildOutputTail` is already watching the other end.

The child then exits `1` for anything that is not a clean Chromium exit. Nothing decides on that code today — the parent notifies on any exit — but an always-zero exit from a process that only exits because its browser died is a false statement, and it is now the status the parent's new message carries.

## Implementation steps

1. Add `src/browser/e2e-exit.ts`: the `ProcessEnd` pair, `processEndDetail`, `withEndDetail`, and `endedCleanly`.
2. `src/browser/e2e-child.ts` — hold `server.process()` from before the close, and in the close handler write `chromium exited (…)` to fd 2 and exit with `0` only when Chromium ended cleanly.
3. `src/browser/e2e-server.ts` — take the `code` and `signal` Node passes the `exit` handler and compose the message through `withEndDetail`.
4. `product/specs/harness.md` — say that the report names the exit status of both processes.
5. `documentation/user-documentation/advanced-agents/harness.md` — the paragraph on what the report carries already promises only "whatever the browser said"; extend it to the exit status.

## Tests

- `src/browser/e2e-exit.test.ts`: a signal wins over a code, because a process killed by a signal also reports a code; a zero code reads as `code 0`; a non-zero code reads as `code N`; neither present is `undefined`; `withEndDetail` returns the message untouched for that case and appends parentheses otherwise; `endedCleanly` is true only for code `0` with no signal.
- `src/browser/e2e-child.test.ts`: the close handler writes Chromium's signal into fd 2 and exits non-zero; a clean Chromium exit writes `code 0` and exits `0`; the line is written before the exit, so a synchronous write is what the parent reads.
- `src/browser/e2e-server-lifecycle.test.ts`: an exit carrying a signal names it in the message; an exit carrying a non-zero code names it; an exit carrying neither reports the bare `e2e browser exited` it always did; the child's own output still follows the message on the next line.

## Out of scope

- Restarting or replacing a browser that died. Nothing supervises one, and the deferred issue in the backlog is explicit that the empirical repro comes before any second attempt at that.
- Keeping the scratch directory of a browser that died, which is the next issue in the backlog and a separate change to `stopSession`.
- Chromium crash dumps, `ulimit`, or anything else that would need the browser configured differently at launch.
- The wording of the `e2e-browser-gone` notification, where it is delivered, or the band above the terminal.
- The remote `browser-exited` frame, which already carries whatever message the far side composed and so carries the new detail unchanged.
