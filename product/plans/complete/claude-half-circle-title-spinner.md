# Make the harness dot track claude 2.1.282: half-circle title spinner, and a settle capture

**Complexity: 4/10**. Two small changes. The harness busy classifier gets a wider glyph test. The screen reader takes one extra confirming capture after output stops, and the busy wiring gets that capture without auto-approve seeing it. The work that mattered was measuring what the current claude actually emits and when, since the detector was calibrated against claude 2.1.210.

## Root cause

There are two faults, and the second only shows once the first is fixed.

**The working title is not recognized.** `classifyTitle` in `src/harness/busy-classify.ts` treats a terminal title as busy only when its first code point is a Braille spinner glyph (U+2800–U+28FF). Every other non-empty title means ready. claude 2.1.210 animated a Braille spinner there. claude 2.1.282 animates two half-circle glyphs instead: `◐ Claude Code` (U+25D0) and `◑ Claude Code` (U+25D1), alternating about once a second while it works, then back to `✳ Claude Code` when idle. So every working capture from the new claude classifies as ready. The title always wins over the screen, and the screen fallback (`esc to interrupt`) runs only when there is no title. The tracker never marks the tab busy, and the dot stays still for the whole turn. opencode is unaffected because it is classified from the screen alone.

**The idle transition never commits.** `BusyTracker` commits working→idle only after two consecutive idle captures. `HarnessScreenReader` captures only about one second after PTY output. claude 2.1.282 writes a single burst when it returns to its prompt (the `✳` title and the footer) and then nothing at all. A timing probe saw one idle capture at the end of the turn and no further output for the next 60 seconds. That leaves `pendingReady` set and the dot blinking until the user next types. With only the glyph fix, the bug turns from "never blinks" into "never stops".

## Correct behavior

`product/specs/harness.md`, Busy/ready status: the dot "blinks while the harness is generating a response or running tools, and stops once the harness returns to its own idle prompt", and "claude and codex set an animated spinner glyph at the start of the terminal title while working; any other title means idle." The half-circle glyphs are claude 2.1.282's spinner, so a title leading with one means working. The `✳` idle title means idle. The idle state should commit a couple of seconds after claude goes quiet at its prompt, keeping the rule that the idle reading has to hold across two consecutive captures.

## Reproduction

- **Title probe.** A throwaway script under `temp/` ran the installed `claude` (2.1.282) in a node-pty behind `@xterm/headless` and logged every OSC title change. Typing `!sleep 8` (bash mode, which needs no login) produced `✳ Claude Code`, then `◐`/`◑ Claude Code` alternating for eight seconds, then `✳ Claude Code`. A model prompt showed the same `◐` frame before failing on `Not logged in`. The screen footer read `esc to interrupt` while working.
- **Timing probe.** The same claude session fed the real `HarnessScreenReader` and `BusyTracker` from `src/`, with the glyph fix applied. The tracker went busy on the first `◐` capture. After the turn, one capture read `✳ Claude Code` as ready, and no PTY output followed for 60 seconds. `busyNow` stayed `true` to the end.
- **Unit.** New cases in `src/harness/busy-status.test.ts` fail on the unfixed code. `classifyBusy` returns `ready` for `◐ Claude Code` and `◑ Claude Code`. A `busyStatusHandler` that has gone idle stays not-busy when the half-circle titles arrive.
- **Live, unfixed.** A scratch instance built from `master@644b7f93` ran `harness claude --no-workspace --no-auto-approve --no-browser`, and the driver typed `!sleep 15` into the harness terminal. The screen showed `Running…` and `esc to interrupt`. The tab's `.dot` did not have the `busy` class in any of 20 samples over 10 seconds.
- **Live, glyph fix only.** The same driver saw the dot busy in all 20 samples during the sleep. It also saw it busy in all 10 samples taken 6 to 11 seconds after claude was back at its prompt.

## Approach

1. **Glyph.** Rename `leadsWithBraille` to `leadsWithSpinner` and accept either the Braille block (U+2800–U+28FF) or the four half-circle glyphs `◐◑◒◓` (U+25D0–U+25D3). claude 2.1.282 was observed using `◐` and `◑`. The other two belong to the same four-frame circle set, and none of them can plausibly lead an idle title. The rule stays shared by claude and codex, so the two keep agreeing on any title.
2. **Settle capture.** After each capture, `HarnessScreenReader` schedules one more capture a capture-delay (one second) later. Any PTY data cancels it and schedules an ordinary capture instead. So a burst that ends in silence gets exactly one confirming re-read of the unchanged screen, and a steadily animating harness never gets one. That capture carries `settled: true` on `ScreenCapture`. It is a real re-read, not a timer committing on the tracker's behalf. With no output there is nothing to change, so the idle reading holding across two captures is exactly what happened, and the existing debounce rule stands unchanged. The reader never re-captures twice for one quiet period, so an idle harness still costs nothing.
3. **Only busy tracking sees it.** Both capture handlers, `captureWiring` in `src/harness/capture/wire.ts` and `buildHarnessDetection` in `src/remote/serve-processes-detect.ts`, skip the auto-approver on a settled capture. The approver treats an identical repeat of a gate it already answered as "could not clear", and a settle capture must not change when that is reported. The recorder, the transcript tailer, and `harness capture` do not use the callback. `harness capture` reads `latestCapture()`, which a settle capture refreshes with identical text.

Rejected: treating any claude title that does not lead with `✳` as busy. That would survive a future glyph change, but it would call every unfamiliar title "working". Also rejected: letting the screen's `esc to interrupt` override a ready title. Title-first is deliberate, and screen text can include that phrase in the conversation itself. Also rejected: committing idle on a single capture for claude's explicit `✳` title. That removes the flicker guard on the strength of an unverified assumption about claude's mid-turn titles. Also rejected: a commit timer inside `BusyTracker`. It would make the tracker's decisions asynchronous at both call sites, and it would commit on elapsed time rather than on a second reading of the screen.

## Implementation steps

1. `src/harness/busy-classify.ts`: `leadsWithSpinner` covering both ranges, comments, and the calibration note on `BUSY_TABLE`.
2. `src/harness/screen.ts`: the settle timer, cancelled by data and by dispose; `settled` on `ScreenCapture`; class comment.
3. `src/harness/capture/wire.ts` and `src/remote/serve-processes-detect.ts`: skip the approver for a settled capture.
4. Tests: `src/harness/busy-status.test.ts` (glyph cases and the idle-then-busy handler case, written first); `src/harness/screen.test.ts` (one settle capture after quiet, none while data keeps arriving, only one per quiet period, cancelled on exit); a `captureWiring` or detection case showing the approver does not see a settled capture; a handler case showing a turn that ends in a single burst commits idle through the settle capture.

## Regression test

`src/harness/busy-status.test.ts`:
- `classifyBusy — claude` › "is busy when the title leads with claude 2.1.282's ◐ spinner glyph" (and ◑).
- `busyStatusHandler debounce` › "claude 2.1.282: an idle tab starts blinking again when the title spinner resumes".

All three failed against the unfixed code. The settle half is guarded in `src/harness/screen.test.ts`, by an end-to-end case that drives a reader and a `busyStatusHandler` through a turn ending in one burst, and by the approver-isolation cases.

## Verification

Run `./scripts/run.mjs check-diff`. Live: rebuild with the fix, then start a scratch instance under `./temp/fix-a-bug/`. Its scratch `HOME` has a `.claude.json` that marks onboarding done and pre-trusts the scratch work directory. Rerun `temp/fix-a-bug-drivers/verify.mjs`. It opens a claude harness tab, samples the tab dot while idle, types `!sleep 15`, and samples while the sleep runs and after it ends. Expected: the dot is not busy while idle, busy throughout the sleep, and not busy again within a few seconds of claude returning to its prompt. A model turn cannot be exercised here because the sandboxed claude has no credentials. Bash mode drives the same title spinner.

Outcome: verified. The dot was not busy in 10 of 10 samples while idle, busy in 20 of 20 during the sleep, and not busy in 10 of 10 after claude returned to its prompt. Rerunning the timing probe against the fixed `src/` showed busy committed on the first `◐` capture, and idle committed one second after the `✳` capture through the settle re-read. It also showed no further captures during 60 idle seconds.

## Spec and docs

- `product/specs/harness.md`: name the spinner glyphs that count (a Braille spinner, or claude's half-circle `◐◑◒◓`). Say that the screen is re-read once after output stops, so a harness that goes quiet the moment it returns to its prompt still gets the confirming idle capture. Update the screen-capture paragraph that says a quiet harness is never re-captured.
- User documentation and `help.md` describe the blink without naming glyphs or capture timing, so neither changes.

## Out of scope

- codex and opencode detection, which the bug report says still works. The settle capture applies to them too, and it only makes their idle transition commit sooner.
- The auto-approver's own stuck detection timing.
