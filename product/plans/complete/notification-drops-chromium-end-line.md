# Drop Chromium's own end line from the gone-browser notification

**Complexity: 3/10**

## Goal

A browser that dies reports itself on two lines today:

```
e2e browser exited (code 1)
chromium exited (signal SIGSEGV)
```

The second line is the `janus e2e-browser` child restating the same death that the first line already
announces. It is written to the child's stderr by `reportBrowserEnd`, captured into the session's
output tail, and appended to the message by `withChildOutput` — so every browser death costs two
lines on the notification and two lines in the band above the tab's terminal.

Remove that line from the report. The notification carries the one status janissary observed
directly, and Chromium's own status stays where a post-mortem belongs: in the log file the
notification already links.

## Approach

The child keeps writing the line. It is genuine evidence, it is the only place Chromium's signal is
named, and the log is composed from the same captured output — so removing it at the source would
take it out of the log too, which is the opposite of what the log exists for.

Instead, filter it out of the tail used to compose the *reported message*, leaving the tail used to
compose the *log* whole. `stopSession` already reads the captured output twice for exactly this
split — a bounded tail for the message, the full text for the log — so the filter goes on the first
read and nothing else moves.

The phrasing being matched is `withEndDetail('chromium exited', …)`, composed in `e2e-child.ts` and
formatted by `e2e-exit.ts`. The prefix becomes a shared constant in `e2e-exit.ts` so the writer and
the filter cannot drift apart, and the predicate that recognizes the line lives beside it.

No regex: `security/detect-unsafe-regex` applies to `src/`, and a `startsWith`/`endsWith` pair reads
more plainly than a pattern for the three shapes this line takes.

## Implementation steps

1. **`src/browser/e2e-exit.ts`** — export `CHROMIUM_END_MESSAGE = 'chromium exited'`, and add
   `withoutChromiumEndLine(tail: string): string`, which drops every line of `tail` that is the
   child's own end report — the bare message, or the message followed by a parenthesized status —
   and returns the rest trimmed. A tail that was only that line becomes the empty string, which
   `withChildOutput` already treats as "the child said nothing".

2. **`src/browser/e2e-child.ts`** — compose the stderr line with the shared constant rather than the
   string literal.

3. **`src/browser/e2e-session.ts`** — in `stopSession`, wrap the tail feeding `reported` in
   `withoutChromiumEndLine`. `captured` and `log` are untouched.

## Tests

**`src/browser/e2e-exit.test.ts`** — `withoutChromiumEndLine`:

- drops the line in its signal form, its code form, and its bare form
- keeps a crash trace above it and returns it without a trailing blank line
- returns the empty string when the end line was the whole tail
- leaves a line that merely mentions chromium alone

**`src/browser/e2e-server-lifecycle.test.ts`**:

- update `carries both the child's status and the browser's own words` — the message is now
  `e2e browser exited (code 1)` alone, and the assertion moves to the log, which still carries
  `chromium exited (signal SIGKILL)` below that report
- add a case: a crash trace followed by the end line reports the trace and not the end line

## Spec and documentation

- `product/specs/harness.md` — the paragraph stating that the launched process "in turn reports the
  browser's own status on the line below" no longer describes the report. Rewrite it to say the
  message carries janissary's own status and that Chromium's is in the log file.
- `documentation/user-documentation/advanced-agents/harness.md` — the same claim in user-facing
  words ("the line below it reports Chromium's own status the same way"), rewritten to match.

## Out of scope

- The rest of the tail. Playwright's launch error, a sandbox profile that would not compile, a port
  that would not bind — every one of those still rides on the notification, because none of them
  restates something the message already said.
- Any change to what the log file holds, or to when it is written.
- The remote path composes its message through this same `stopSession` on the remote host, so it
  inherits the change with no edit of its own.
