# Browser log carries Chromium's own output

**Complexity: 3/10** — one environment variable on an existing spawn, plus the tests and the two documents that already describe a log file nothing was filling.

## Goal

Make the dead-browser log file contain what Chromium said before it died, rather than only the two status lines janissary writes about it. A `-b` browser that segfaults currently produces a log of exactly:

```
e2e browser exited (code 1)
chromium exited (signal SIGSEGV)
```

Everything the browser itself printed on its way down is captured by Playwright inside the child process and discarded there, so the log file, the notification tail, and the band above the tab all report the death without a word from the thing that died.

A browser that fails to *launch* is the exception and already reports itself: Playwright appends the browser output it collected to the launch error, and the error takes it out of the child. The gap is a browser that came up, ran, and died afterwards — the segfault this was reported for.

## Approach

The child (`janus e2e-browser`) calls `chromium.launchServer()`, and Playwright spawns Chromium with its own pipes. It reads both of Chromium's streams line by line and hands each line to its `pw:browser` debug logger, which is silent unless the `debug` package is enabled for that namespace. The lines also accumulate in a `RecentLogsCollector`, but the only thing that ever reads it is the launch error — `BrowserServer` does not surface it, so once the browser is up the child cannot ask for a single line.

So enable the logger. `debug` writes to stderr, and the parent already watches the child's stderr into the bounded buffer that becomes both the report's tail and the log file — the whole path from Chromium's output to the log file exists and ends one variable short. Setting `DEBUG=pw:browser` in the child's spawn environment connects it, with no new plumbing and nothing new to tear down.

The namespace stays exactly `pw:browser`. `pw:protocol` would add every CDP message — page content and anything typed into a page among them — to a file written into the project directory, and `pw:*` would enable it. The narrow value is the point, not an incidental choice, so a test holds it there.

The variable is set on the child's environment beside `TMPDIR` and `MAC_CHROMIUM_TMPDIR` rather than inherited, for the same reason those two are: the browser sandbox's environment allowlist would otherwise filter it out.

What this does not do is make Chromium print a stack trace. Playwright launches it with `--disable-breakpad`, so a fatal signal kills it with no crash handler to dump frames or write a minidump. What reaches the log is Chromium's ordinary output — its own last lines before the fault, launch failures, and the startup errors that make a browser die immediately. The two documents that promise the log holds a stack trace are corrected to describe what it actually holds.

## Implementation steps

1. Export the namespace constant from `src/browser/e2e-child.ts`, beside `WS_PATH_ENV`, since that file is where the child's environment contract is stated.
2. Set `DEBUG` to it in the child's spawn environment in `src/browser/e2e-server.ts`, with a comment explaining that this is what turns Playwright's captured Chromium output into lines on the stderr the session already reads.
3. Extend `src/browser/e2e-server-launch.test.ts` with the environment assertions.
4. Correct the log-file paragraph in `product/specs/harness.md` and the matching paragraph in `documentation/user-documentation/advanced-agents/harness.md`.

## Tests

- The child's spawn environment names Playwright's browser logger in `DEBUG`.
- It does not enable the protocol logger, whose messages carry page content.
- Run `./scripts/run.mjs check-diff` after each implementation, test, and documentation change.

## Out of scope

- Removing `--disable-breakpad` or otherwise arranging for a real crash dump. That is a separate change with a separate cost: a minidump needs symbolizing before it says anything, and Playwright's own default is what would be overridden.
- Diagnosing the segfault itself, which is the deferred issue about the documentation screenshot pipeline. This change is what produces the evidence that issue asks for; it does not act on it.
- Any change to the bounds in `src/child-output.ts`, to the notification, or to the log file's name and location.
- Restarting or replacing a browser that died.
