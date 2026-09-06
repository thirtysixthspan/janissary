# Persist a dead browser's full output to a log file the notification links to

**Complexity: 4/10** — no new architecture. Both halves already exist: the browser's own output is already captured on its way out (`src/child-output.ts`), and a notification line already renders a clickable link that opens a file in an editor tab (`openFile`, used by auto-approve's screen captures). The work is keeping the full text instead of only a tail, writing it to a file, and handing that path to the existing link.

## Goal

When Chromium dies under a signal — a segfault being the case that prompted this — everything it said on its way out is the only account of why. Today that account is bounded to the last 2000 characters and the last 10 lines of them (`TAIL_CHARACTERS` / `TAIL_LINES`), because it is composed into the notification's own message text and into the band above the `-b` tab's terminal, where an unbounded stack trace would be unreadable. A segfault trace is longer than that bound, so the part naming the faulting frame is exactly the part that gets dropped.

Keep the bounded tail in the message — it is what makes the line readable — and additionally persist the **complete** output to a dedicated log file under `.janissary/`, linked from the notification line so one click opens it in an editor tab. This mirrors what auto-approve already does with the screen capture behind an approval (`writeCaptureFile` → `notify(..., openFile)` → `OpenFileLink`).

## Approach

Four seams, each already present:

1. **`src/child-output.ts` keeps more than it reports.** `captured` is sliced to `TAIL_CHARACTERS` at capture time, so the full text is destroyed before anyone can ask for it. Widen the retained buffer to a log-sized bound and derive the existing tail from it: `text()` returns exactly what it returns today (last 2000 characters, last 10 lines of them, trimmed), and a new `full()` returns the whole retained buffer, trimmed. One accumulation, two views. The retention stays bounded — a child that spews forever must not grow the process — but at a size that holds a complete crash trace.

2. **`src/browser/e2e-session.ts` hands the full text to whoever reports the death.** `stopSession` is already the one place every death message is composed, and it already reads the child's output before the release kills it. It gains one more read — `output.full()` — composed with the same message into the log's text, and passes it to `onGone` as a second argument. `onGone` becomes `(message: string, log?: string)`: `log` is the complete text to persist, and is `undefined` when the child said nothing at all, so a silent death writes no file and reads exactly as it does today.

3. **A new `src/browser/browser-log.ts` owns the file**, modelled directly on `src/harness/capture-file.ts`: an `init` that names `<project>/.janissary/browser-logs/`, a write that builds the filename with the shared `harnessArtifactFilename(label, endedAt, '.log')`, and a clear that `main.ts` runs at startup alongside `clearCaptureDirectory()`. The write returns `string | undefined` and swallows its own failure — this runs on the path whose entire job is reporting some other failure, and a full disk must not turn a browser death into an unhandled throw. That is the one deliberate difference from `writeCaptureFile`, which throws.

4. **`HarnessManager.browserGone` writes the file and links it.** It already receives the message and calls `notify(managers, 'e2e-browser-gone', label, message)`; it gains the log text, writes it, and passes the path as `notify`'s existing `openFile` argument. The band above the terminal (`tab.harness.browserError`) is unchanged — it carries the same message it always did.

Two deliberate departures from the auto-approve precedent, both because a browser death is rare and a permission approval is not:

- **The log is written whether or not the notifications feed is open.** `auto-approve-wire.ts` writes its capture only when the feed is open, because otherwise it would write a file per approval that nothing ever links to. Deaths are rare and the file is a post-mortem, so it is written unconditionally — the same reasoning that already keeps a dead browser's scratch directory (`e2e-session.ts`'s `release`). It is swept at the next startup like every other `.janissary/` artifact directory.
- **Every unasked-for death gets one, not just a segfault.** `stopSession` is only ever given a message for an ending the user did not ask for, so that condition is already exactly the right gate. Sniffing for `SIGSEGV` specifically would leave `SIGBUS`, `SIGILL`, `SIGABRT`, and a Playwright launch failure — all of which produce output worth reading in full — with a truncated account for no reason.

## Implementation steps

1. `src/child-output.ts`: add a `LOG_CHARACTERS` bound, retain up to it in `captured`, derive `text()` from the last `TAIL_CHARACTERS` of it as today, and add `full()` to the `ChildOutputTail` type returning the trimmed whole. Document why there are now three bounds rather than two.
2. `src/browser/browser-log.ts` (new): `initBrowserLogDirectory`, `writeBrowserLog`, `clearBrowserLogDirectory`, following `src/harness/capture-file.ts`'s shape and importing `harnessArtifactFilename` from `../harness/artifact-name.js`.
3. `src/harness/artifact-name.ts`: extend the header comment to name the browser log as a fourth artifact sharing the filename shape. No code change.
4. `src/main.ts`: call `initBrowserLogDirectory(cwd)` beside the other `init*` calls, and `clearBrowserLogDirectory()` in the non-`--relaunch` clear list.
5. `src/browser/e2e-session.ts`: widen `onGone` to `(message: string, log?: string)`; in `stopSession`, read `output.full()` alongside `output.text()` before the release and pass the composed log text through.
6. `src/browser/e2e-server.ts`: widen `E2EBrowserOptions.onGone` to match. The one direct `options.onGone(...)` call (the port band being full) passes no log — nothing had started, so there is nothing a child said.
7. `src/harness/scratch-dir.ts`: widen `onBrowserGone` in `harnessSpawnEnv`'s options to match.
8. `src/harness/manager.ts`: `browserGone(label, message, log?)` writes the log through `writeBrowserLog` and passes the returned path to `notify` as `openFile`.
9. `web/src/shared/transcript/transcript-line.tsx`: the link's accessible name and tooltip say "capture"/"the captured screen", which is now only one of the two things it can open. Generalize both to name the action rather than one artifact, and update the component's header comment.

## Tests

- `src/child-output.test.ts`: `full()` returns everything a child said past the ten-line tail; `full()` and `text()` agree for a child that said less than the tail bound; `full()` is bounded for a child that spews past the log bound, keeping the newest; `full()` is empty for a child that said nothing.
- `src/browser/browser-log.test.ts` (new, mirroring `src/harness/capture-file.test.ts`'s `vi.mock('node:fs')` style): the directory is created recursively under `.janissary/browser-logs`; the filename is built from label and timestamp; a filename-hostile label is sanitized; a write that throws returns `undefined` rather than propagating; the clear removes the directory and ignores its own errors.
- `src/browser/e2e-server-lifecycle.test.ts`: the existing `onGone` assertions gain the second argument. New cases: the log carries the child's complete output where the message carries only the tail; a child that said nothing produces no log.
- `src/harness/manager-browser.test.ts`: the notification carries the written log's path as its `openFile`; a death with no log notifies with no path; a write that fails still notifies.
- `web/src/shared/transcript/transcript-line.test.tsx`: the existing `aria-label` assertion moves to the generalized wording.

## Spec updates

- `product/specs/harness.md` — in the gone-browser section, record that the complete output is also written to a log file under `.janissary/browser-logs/`, that the notification line links it and opens it in an editor tab, that the in-message tail is unchanged, and that a browser which said nothing produces no file.
- `product/specs/notifications.md` — the `e2e-browser-gone` event is entirely absent from the "Events that notify" list and the focus-suppression paragraph, even though the code has carried it since it was added. Add it, and record that its line carries the log link. (The list's "Twelve event types" count is stale for the same reason; correct it while adding the entry.)

## Docs

- `help.md` and `documentation/user-documentation/` do not document what a browser death reports today, so there is nothing there to correct. Per the task's rules, no new documentation is written for newly added behavior.

## Out of scope

- **The remote path.** `src/remote/manager.ts`'s `notifyBrowserGone` receives an already-composed message string over the wire and has no access to the far side's full output; carrying it would need a protocol frame change on both ends. The remote notification keeps the tail-in-message behavior it has today.
- **The band above the `-b` tab's terminal.** It keeps carrying the message alone. It is not a transcript line and renders no links, so a path in it would be text the user has to copy by hand.
- **The kept scratch directory**, its sweep, and anything else `release` does — untouched.
- **Why the browser dies after the first screenshot** (`product/backlog/issues.md`'s deferred entry). This makes the evidence readable; it does not diagnose it.
