# Auto-resume a harness blocked by a subscription limit

**Complexity: 7/10** — a new per-harness detector recognizing three reset forms with its own state machine (arm, schedule, cancel, deliver), an added `ScheduleManager` API, unread suppression threaded through busy tracking, a protocol-version bump carrying two new remote frames, and launch-flag plus strip-flag surface on both sides. Nothing here is architecturally novel — every piece has a working precedent in auto-approve, and all three reset forms reuse the scheduler's own parsers — but the pieces multiply and the timing reasoning is the hard part.

## Goal

Janissary already watches a harness's rendered screen and answers its permission prompts without the user (`product/specs/harness.md` § Auto-approve permissions). This feature does the same for the other kind of blockage a fleet of background agents hits: a subscription or usage limit, where the harness stops working and states when the limit resets. When the app recognizes that screen on a harness that does not resume by itself, it reads the stated reset time out of the text, waits for it, and tells the harness to pick the task back up one minute later — so a tab parked on a usage limit rejoins the run on its own.

A tab parked this way does **not** raise an unread flag: it is not waiting on the user, so flagging it would be noise. The resume is delivered through the scheduled-command input the scheduler already uses for harnesses, so the wait is visible in the schedule window, cancellable by the user, and managed like any other timer.

The recognized text, as it appears on screen:

```
■ You've hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to
purchase more credits or try again at 1:20 PM.
```

## Design decisions

Every decision below is settled: either the feature text states it, existing behavior settles it, or the user answered it in planning. Nothing is left for the implementer to choose.

### Behavior

- **codex only, through a registry.** The app recognizes a limit screen for one harness today: codex. claude and opencode recover from their own limits, so they are absent from the registry rather than special-cased inside it — the same shape as `GATE_TABLE` in `src/harness/auto-approve.ts`, where absence is what a harness's name means. Adding a second harness later is one table row.
- **A limit signal plus a stated reset time, or nothing.** The screen must carry the usage-limit wording *and* a reset in one of the three forms codex prints. Neither half alone matches.
  - **A clock time** — `try again at 1:20 PM`, parsed by `parseTimeOfDay` (`src/schedule/parsing.ts`), the scheduler's own parser, so `1:20 PM`, `1:20pm` and `13:20` all work.
  - **A date and a clock time** — `try again at Jul 8th, 2026 10:59 AM`, the weekly-window form. The year in it is read and ignored, because `nextDateTime` (`src/schedule/time.ts`) already builds the date from month and day and rolls a past date to next year — exactly the behaviour `schedule on <date>` has. A date with no time is not a reset and does not match.
  - **A duration** — `try again in 4 hours 23 minutes`, the form older codex builds print. Its `N<unit>` tokens are summed and the total must not exceed **24 hours**; a longer one is not trusted, so no resume is scheduled. The ceiling matches what claude itself will wait for before handing the decision back to the user, and a number that long is more likely a misparse than a real wait.
- **A limit screen the app cannot schedule for behaves exactly as it does today.** No time at all, or a form it will not trust, means no entry and no change to the badge. The silence belongs to a tab the app is going to recover on its own; a tab that needs the human still says so.
- **The stated time is the source of truth; resume is one minute after it.** The reset the harness names is the earliest moment it will accept work, so the resume waits for it and adds a margin.
- **A stated time already in the past resumes at once.** Clock skew, a slow capture, or a user reading the transcript later can put the recognized instant behind us. The resume is then `now + the one-minute margin` rather than the scheduler's next-day rollover of that clock time, so the tab rejoins immediately instead of being parked until tomorrow.
- **One resume per blockage.** After a resume is delivered, the tab stops: no second attempt against the same blockage, no schedule pile-up. The feature re-arms only when the screen changes, which is what a genuinely new blockage looks like.
- **A blockage that clears cancels the pending resume.** If the limit screen goes away before the resume instant — the user bought credits, or the limit was advisory — the pending entry is cancelled, so the harness is never interrupted by a stale instruction.
- **A tab closed or exited before the instant drops the resume silently.** A harness tab's schedule lives in memory and dies with the tab, so the entry simply never fires, exactly like every other harness timer. Nothing is recorded.
- **The parked tab is idle, silent, and unflagged.** The strip dot stops blinking immediately (the harness is waiting, not working, the same rule a recognized permission prompt follows), no unread badge is raised, and the thirty-second `harness-idle` escalation never arms. Once the resume is delivered, normal busy/idle tracking resumes, so a tab that goes idle again while hidden badges then as it always would.
- **Nothing is written to the tab's transcript.** The notification and the schedule row are the whole record, matching auto-approve's successful approval, which writes to the transcript only for its no-workspace security warning.

### User-visible wording

- **The resume prompt typed into the harness** is exactly: `resume the task you were working on.`
- **The scheduled entry** is named `auto-resume`, and its `spec` is `at <time>` formatted by the app's existing `fmtTime` (`src/schedule/display.ts`), so the schedule window row reads `auto-resume  at 1:21pm  (next: Oct 3 1:21pm)` — the same shape as any timer a user typed by hand.
- **The notification** when a resume is scheduled is `Hit a usage limit; resuming at 1:21pm` (recorded in the feed as `codex: Hit a usage limit; resuming at 1:21pm`), with the time rendered by `fmtNextRun` (`src/schedule/display.ts`) — one formatter for every case, so the line reads `resuming at 1:21pm` for a same-day reset and `resuming at Oct 8 10:59am` for a dated one, exactly as the schedule window's `next:` column one line away shows it. It carries the same capture link an auto-approval carries. Delivery needs no new event: `ScheduleManager.fire` already records `schedule-fire`, whose text `notificationText` shapes as `Scheduled: resume the task you were working on. in codex`.
- **The strip flag** has three states, and two of them share a label: armed is `Auto-resume`, a scheduled-but-undelivered resume is `Auto-resuming` in green, and a tab that has already resumed goes back to `Auto-resume`.
- **The launch option** is `--auto-resume` to confirm the default and `--no-auto-resume` to opt out, with no short flag — the same default-on/opt-out shape as `--no-auto-approve`, without inventing a new single letter. The dialog checkbox reads `Auto-resume (--auto-resume) — codex only`, mirroring `Auto-approve (-y) — …only`.
- **`--auto-resume` is refused for a harness with no detector**, with `` `--auto-resume is only supported for the codex harnesses.` `` — the `-y` refusal's shape in `src/harness/command-parse.ts`. Nothing is refused in `src/profile/entry-openers.ts`, because a profile harness entry has no `autoResume` field to validate (see Out of scope).

### Implementation placement

- **Detection and the parked state live in a new module beside auto-approve** — `src/harness/auto-resume.ts` — holding a per-harness `RESUME_TABLE`, the pure detector, the instant calculation, and a `HarnessAutoResumer` observer. It joins the existing capture fan-out as a **third consumer** at `src/harness/capture/wire.ts` (approver, resumer, then busy handler, so the busy handler reads the resumer's parked state as of the same capture), and it is owned by `HarnessRuntime` so it lives and dies with the tab. It is not folded into `HarnessAutoApprover` (one class would own two unrelated jobs) and busy classification does not grow a third state (busy classification would own a concept it does not have).
- **The resume is a one-shot entry appended to the tab's own schedule**, through a new `ScheduleManager` method, so it appears in the schedule window and the schedules tab, can be cancelled by the user, is retried while the harness is not yet running, and is dropped after delivery. `set` today replaces a tab's whole list, so appending through it from outside the owner would drop the user's own timers on that tab.
- **The entry is built directly from the computed instant**, not by synthesizing a schedule command and re-parsing it: the instant is calculated, not typed, so a grammar round-trip would add a clock-time addition and a past-time override for nothing. `spec` is formatted with `fmtTime` so the row reads like a hand-written timer.
- **Busy tracking is told the tab is parked.** `BusyTracker.observe` takes a fourth input alongside the existing `stuck`, and a parked tab commits `busy: false, unread: false` on the first capture, in the same branch position as a recognized permission gate — one decision point, so no badge can slip in afterwards through the debounced idle path, and `applyBusyTransition` never reaches `armHarnessIdleEscalation`.
- **The setting is a tab field, the visible state is a harness-view field.** `Tab.autoResume` is the launch setting, set once at spawn exactly like `Tab.autoApprove`; `HarnessView.autoResumeState` is absent while merely armed and otherwise `'scheduled'` or `'resumed'`. Two booleans would admit a state that cannot happen, and putting the setting in the view would make it mutable after launch, unlike auto-approve's.
- **Remote parity splits the same way auto-approve's does.** The far side detects and reports the reset clause in a new frame; the near side turns it into an instant against its own clock, schedules it in its own `ScheduleManager`, and delivers through the existing harness input path; the near side acknowledges delivery back over the link so the far side's observer re-arms. Detection therefore happens exactly once per screen, and a far session that is slow or briefly absent is handled by the scheduler's existing retry rather than by new logic. The frame carries the clause as text rather than a resolved instant, because only the near side's clock evaluates the entry and only the near side can apply the past-time clamp — resolving it far side would put two clocks in the decision.
- **The remote half takes a protocol-version bump, and that cost was accepted explicitly.** Adding the frames means bumping to version 25, which refuses any remote session against a peer that has not been updated — the same trade version 18's detection split made. Confirmed rather than assumed, because it means every remote tab is down until both ends run this build.

## What already exists (reuse, don't rebuild)

| Need | Existing thing |
|---|---|
| Rendered-screen text for a harness tab | `HarnessScreenReader` / `ScreenCapture` (`src/harness/screen.ts`), one headless xterm per harness PTY, already running on every local harness tab |
| Where a new observer subscribes | `captureWiring` (`src/harness/capture/wire.ts`), which already fans one capture out to two consumers and skips the `settled` capture |
| A per-harness registry keyed by tab | `Tab.harness.name` (`src/tab/types.ts`), the key `GATE_TABLE`, `BUSY_TABLE` and `LAUNCH_ARGS` are all written against |
| The registry idiom (support test, catalog-ordered name list, prose name list) | `supportsHarnessAutoApprove`, `autoApproveHarnessNames`, `describeAutoApproveHarnesses` in `src/harness/auto-approve.ts` |
| An observer decoupled from `Managers` so it can run far side too | `HarnessAutoApprover`'s callback shape — `approve` / `notify` in, no managers reference (`src/harness/auto-approve.ts`, consumed by `src/remote/serve-processes-detect.ts`) |
| Ownership and disposal for per-PTY observers | `HarnessRuntime` (`src/harness/runtime.ts`) and `HarnessRuntimes` (`src/harness/runtime-registry.ts`), disposed on PTY exit, tab close, and shutdown |
| Rejecting a menu that has scrolled into history | `detectClaudeGate`'s "no live input caret beneath" and codex's `matchesFamily` composer check (`src/harness/auto-approve.ts`, `src/harness/codex-permission-gate.ts`) — the reason the tail-position rule below exists |
| Parsing each of the three reset forms | `parseTimeOfDay`, `parseMonthDay` and `parseInterval` (`src/schedule/parsing.ts`) — the parsers `schedule at` / `on` / `every` already use — with `nextOccurrenceOfTime` and `nextDateTime` (`src/schedule/time.ts`) turning them into instants |
| Formatting a time for display | `fmtTime` / `fmtNextRun` (`src/schedule/display.ts`) |
| A future one-shot entry | `ScheduleEntry` (`src/schedule/types.ts`) with `spec`, `nextRun`, `recurring: false`, driven by the existing one-second `ScheduleManager.tick` |
| Delivering text into a harness | `typeIntoHarness` (`src/harness/input.ts`), used by `ScheduleManager.fire` and by `send` |
| Cancelling one entry | `ScheduleManager.cancel(label, id)` (`src/schedule/manager.ts`) |
| Reading the time a schedule row will show | `scheduleView` / `aggregatedScheduleView` (`src/schedule/views.ts`) |
| Suppressing unread and the idle escalation | the `stuck` input `BusyTracker.observe` already takes and the gate branch it already has (`src/harness/busy-status.ts`) |
| Raising a notification with a capture link | `notify(managers, 'auto-approve', label, message, { openFile })` via `src/harness/auto-approve-wire.ts`, and the three places an event type must be registered (`NotificationEventType`, `EXPLICIT_EVENTS`, `notificationText` in `src/notifications/`) |
| Showing a flag in the strip | `autoApproveFlag` (`src/tab/view.ts`) → `TabView.flags` → `tabFlagDisplay` (`web/src/shared/tab/flag-display.ts`), including the green `tab-flag--active` class |
| Telling the client which harnesses qualify | `HarnessLaunchView.autoApprove` (`src/protocol/tab.ts`), filled in `harnessLaunchView()` and read by `HarnessLaunchDialog` |
| Per-launch opt-in plumbing | `Tab.autoApprove` → `SpawnTabOptions` (`src/harness/spawn-options.ts`) → `spawnTab` (`src/harness/tab-spawn.ts`) → `parseHarnessFlags` (`src/harness/command-parse.ts`) |
| The remote split | `gate-event` / `busy-transition` / `spawn.autoApprove` in `src/remote/protocol-frames.ts`, `buildHarnessDetection` in `src/remote/serve-processes-detect.ts`, and the `onGateEvent` / `onBusyTransition` handlers in `src/remote/pty-session.ts` |

## Approach

### 1. The pure half — `src/harness/auto-resume.ts` (new)

A `RESUME_TABLE` keyed by harness name whose single row is `codex`, each row holding a matcher that takes the capture's screen text and returns the reset clause it found, or nothing. `detectResumeLimit(text, harnessName)` dispatches over it and returns nothing for any harness absent from the table — the same contract as `detectPermissionGate` in `src/harness/auto-approve.ts`.

The codex matcher reads the capture's rows, takes **the last three non-blank ones**, joins them with single spaces, and runs one bounded pattern over that string. The limit wording and the reset clause are two halves of that pattern, and neither matches alone. The clause is captured, not interpreted: a small set of arms turns the captured text into an instant — `parseTimeOfDay` for a clock time, `parseMonthDay` (`src/schedule/parsing.ts`) plus `nextDateTime` (`src/schedule/time.ts`) for a dated reset, and `parseInterval` for a duration, summed across its tokens and refused past 24 hours. Every one of those is the scheduler's own parser, reused for `at`, `on` and `every` forms; nothing here re-implements date or time parsing. The capture is de-ANSI'd visible rows, so no normalization of the text is needed beyond the join — the join of a few trailing rows is what lets the match span the line wrap.

**The apostrophe must match both forms.** codex prints `You’ve` with a typographic apostrophe (U+2019), not `'` — the example at the top of this plan carries it, and every wrapper written against this banner has had to accept both. A pattern anchored on the ASCII form silently matches nothing, and the failure is invisible: the tab simply parks as it does today. Accept either apostrophe in the limit wording.

**Position rule.** Restricting the match to the trailing rows is also the staleness rule, and it is not incidental: a limit message the harness later quotes in its scrollback sits far from the tail and must not schedule a resume from a reset that has already been and gone. Three rows is what the recognized message needs — it wraps across two — while anything the harness prints afterwards pushes it out. This is the same intent as auto-approve's staleness rules (`detectClaudeGate`, `matchesFamily`), which reject a menu that has scrolled above the harness's live composer; tail position is used here instead because codex's usage-limit screen leaves its input box visible underneath and so cannot use a composer test.

`resumeInstant(reset, now)` is the second pure function: it turns a recognized reset into the instant the resume is due — the stated clock time today, or the stated date at that time, or now plus the stated duration; plus `RESUME_MARGIN_MS` (60 000), rolled over midnight; and — when the result is not after `now` — `now + RESUME_MARGIN_MS`. That last clause is not a nicety: codex prints its reset time without seconds, so a limit hit at 7:36:15 against a reset at 7:36:40 reads as `try again at 7:36 AM` — a time already gone, which the scheduler's own next-day rollover would turn into a day late. Every wrap-around and already-past rule above lives here.

### 2. The observer — `HarnessAutoResumer` in the same module

Constructed with callbacks and no `Managers` reference, exactly like `HarnessAutoApprover`, so the same class runs locally and far side. The local wiring passes `schedule`, `cancel`, `onScheduled` and `onSettled`; the far side passes only `onScheduled`.

Its state is three fields: the text it last acted on, the instant already scheduled for the current blockage, and the id of the entry it appended. `onCapture` proceeds in this order:

1. Return immediately for a harness absent from the table — no state is created for a harness the feature does not apply to.
2. Return when the capture's text equals the text it last acted on. A redraw of the same screen is not a new decision; this is the approver's `lastApprovedText` guard (`src/harness/auto-approve.ts`) inverted, and without it every settled-then-redrawn screen would re-arm.
3. Record the new text.
4. With no reset clause found on this screen: clear the acted-on instant (so the next blockage re-arms) and cancel the pending entry if one is still due, then return.
5. Otherwise compute the instant. If it equals the one already acted on, return — this is the one-resume-per-blockage rule.
6. Otherwise record it, append the entry, and report.

`onSettled` clears the pending id — the entry has left the tab's schedule, delivered or withdrawn — and reports it, so the strip flag leaves `Auto-resuming` either way. The name says neither outcome because the entry's does not: a resume the user cancelled is not a resume that landed. `isParked` is true from the moment a blockage is acted on until the screen changes, which is the window busy tracking is told about.

The observer holds no OS resource: the entry it appended belongs to the tab's schedule and dies with the tab, exactly as a profile's one-shot launch prompt does.

### 3. Wiring — the fan-out, the runtime, and the launch option

- `src/harness/capture/wire.ts`: `captureWiring` takes an `autoResume` boolean beside `autoApprove` and builds the resumer when it is set, returning it on `CaptureWiring`. The resumer runs before the busy handler (like the approver) so the busy handler sees the parked state for the same capture. A `settled` capture skips it, for the reason the comment there already gives for the approver.
- `src/harness/auto-resume-wire.ts` (new, small): builds the local resumer with the schedule, cancel, notification and capture-file callbacks, mirroring `src/harness/auto-approve-wire.ts`'s shape — `managers.schedule.add` for the entry, `writeCaptureFile` for the notification's link, and the two state setters.
- `src/harness/auto-resume-state.ts` (new, tiny): `reportAutoResumeScheduled(managers, label)` and `reportAutoResumed(managers, label)`, beside `src/harness/auto-approved.ts`'s `reportAutoApproved` — the twelve-line module that lights auto-approve's flag. It is its own module for the same reason `auto-approved.ts` is: two callers set this flag, the local wire and the remote `onResumeEvent` handler, and neither should reach into the tab to do it.
- `src/harness/runtime.ts` / `src/harness/observers.ts`: `HarnessRuntime` gains a resumer member, disposed on the same path as the other observers.
- `src/harness/spawn-options.ts`, `src/harness/tab-spawn.ts`, `src/harness/manager.ts`: `autoResume` is threaded beside `autoApprove` and lands in `Tab.autoResume` at `spawnTab`. `openFromProfile` passes `supportsHarnessAutoResume(entry.tool)` for the profile default, beside its existing `entry.autoApprove ?? supportsHarnessAutoApprove(entry.tool)`. No security warning accompanies it — unlike auto-approve, typing a resume prompt into the harness grants it nothing, so the no-workspace warning does not apply.
- `src/harness/command-parse.ts`: `--no-auto-resume` opts out, `--auto-resume` confirms the default, and the default is on only for a harness in the registry — the shape of the `noAutoApprove` / `requestedAutoApprove` / `supportsHarnessAutoApprove` three lines there. The name `resume` is already taken in this domain: `SpawnTabOptions.resume` and `resumePtyId` mean attaching to a harness already running on a peer, which is why the setting, the schedule entry and the flag all carry the `auto-` prefix.
- `src/harness/index.ts` is untouched: the registry is keyed by names `HARNESS_COMMANDS` already defines, and codex is already in it.

### 4. The schedule

`ScheduleManager` gains `add(label, entry, hooks?)`: append (creating the list when the tab has none), replace any entry carrying the same id, announce the change so the schedule window and schedules tab refresh, and write a non-harness tab's schedule to its state file the way `tick` and the `schedule` command do. `hooks` is an `EntryHooks` pair — `fired` runs once after a successful delivery and never on a tick where delivery had to wait, since a retry is not a firing; `removed` runs when the entry leaves the schedule any other way, which is the user cancelling it, a clear, or the tab closing. It exists so the owner of delivery stays the owner while the observer learns what became of its entry: `fired` is what flips the strip flag from scheduled to resumed, and `removed` is what stops the strip claiming a pending resume for an entry a user has withdrawn. The alternative, a second timer inside the observer, was rejected because it would duplicate the scheduler's timing, its retry rule and its one-entry-per-tick budget.

The hooks are keyed by tab and then entry id, in two maps rather than one joined key: a profile harness entry's name may contain a space, and `codex team 2` must not read as an entry of `codex team`.

`fireDue` already applies that budget to harness tabs, so a tab holding both a user's timer and a resume never sees two prompts concatenated in one tick.

The entry is `{ id: 'auto-resume', command: 'resume the task you were working on.', spec: 'at <fmtTime>', nextRun: <instant>, recurring: false }`. If the tab already holds an `auto-resume` entry, its instant is replaced rather than a second row added under the same id — the re-arm rule makes this nearly unreachable, but a duplicate id in one tab's schedule would be a defect.

### 5. Busy tracking and the strip flag

- `BusyTracker.observe` takes a fourth `parked` input. It is evaluated with the permission gate, ahead of the busy/ready signals, and commits `{ busy: false, unread: false }` immediately: the dot stops without the two-consecutive-capture debounce, no badge is raised, `pendingReady` is cleared, and `applyBusyTransition` takes its not-busy path without reaching `markUnread` or `armHarnessIdleEscalation`.
- `busyStatusHandler` takes the resumer beside the approver and passes `resumer?.isParked ?? false`. A harness with no detector is unaffected, since `busyStatusHandler` already returns undefined for it.
- `src/tab/types.ts`: `Tab.autoResume?: boolean` and `HarnessView.autoResumeState?: 'scheduled' | 'resumed'`.
- `src/tab/view.ts`: `autoResumeFlag(tab)` returns `['autoResuming']` while scheduled and `['autoResume']` otherwise, so the strip never shows both.
- `web/src/shared/tab/flag-display.ts`: `autoResuming` gets `className: 'tab-flag--active'` (the green `autoApproved` already uses) and the label `Auto-resuming`; `autoResume` gets the label `Auto-resume`. Both reuse the same bolt icon auto-approve uses — the two features are siblings and a second icon would carry no information the label does not.
- `src/protocol/tab.ts`: `HarnessLaunchView` gains `autoResume: string[]` beside `autoApprove`, with the same documenting comment, and the `TabView.flags` comment gains both new names.

### 6. Client

- `web/src/harness/HarnessLaunchDialog.tsx`: the checkbox reads `view.autoResume` for support, default and label, exactly as `autoApprove` does — the server delivers the list so the dialog cannot drift from the registry.
- `web/src/harness/harness-launch-command.ts`: submit `--no-auto-resume` when the box is unchecked, and nothing when it is checked (the default is on), mirroring the auto-approve branch.

### 7. Notifications

A new `'auto-resume'` member of `NotificationEventType`, an entry in `EXPLICIT_EVENTS`, and a `notificationText` arm returning the detail verbatim as the `'auto-approve'` arm does. It is explicit rather than ambient, for the reason `auto-approve` is: the app raised it on its own behalf, and focus suppression would discard exactly the line a user watching one tab most needs when a *different* tab parked itself.

### 8. Remote parity

- `spawn` gains `autoResume?: boolean`, and so does `RemoteProcessState`, so a detached tab restored by attach comes back with the setting it was launched with — the `autoApprove` path through `src/remote/process-state.ts`, `src/sessions/store.ts`, `src/sessions/snapshot.ts` and `src/sessions/attach.ts`.
- `ServerFrame` gains `resume-event`, carrying the spawn id, the reset clause as the harness printed it, the detection time, and the triggering capture inline and base64-encoded like `output` — so the client writes the same capture file a local detector would have, with no second round trip. It travels through the existing detached-peer pending buffer unchanged, so a resume detected while detached queues and replays like `gate-event` does.
- `ClientFrame` gains `resume-ack`, sent by the near side when the entry is delivered, which clears the far side's acted-on instant so its observer re-arms.
- `buildHarnessDetection` (`src/remote/serve-processes-detect.ts`) builds the resumer with only an `onScheduled` callback that sends `resume-event`, and grows a `delivered()` on `HarnessDetection` so `RemoteProcesses` can route `resume-ack` to it. It also passes the resumer's parked state into its own `BusyTracker.observe`, so a remote tab's dot and badge follow the same rule as a local one.
- `src/remote/pty-session.ts` grows an `onResumeEvent` in the same `deliver` pattern as `onGateEvent`: write the capture file, `notify(..., 'auto-resume', ...)` with the original detection time when the report is a replay, append the entry through the same `ScheduleManager.add` the local path uses, and set the strip flag to scheduled. The near side sends `resume-ack` whenever its entry leaves the tab's schedule — on delivery *and* on the cancellation above — because delivery can fail indefinitely (the harness never returns, the tab is never reattached) and the far side cannot infer from its own screen that the scheduler has given the entry up. A replayed report whose instant has passed clamps to now + the margin, so a detached tab resumes on reattach rather than waiting a day.
- `REMOTE_PROTOCOL_VERSION` goes to 25 with a changelog paragraph in the style of version 18's. `resume-event` decodes in `src/remote/frame/decode-detect.ts`, beside the decoders for the version-18 detection family, validating `capturedAt` through the same `validCapturedAt` bound and base64-decoding the capture the way `decodeGateEvent` does; `resume-ack` decodes beside it. `toWire` in `src/remote/protocol.ts` base64-encodes `resume-event.capture`, and both types are admitted by the `CLIENT_FRAME_TYPES` / `SERVER_FRAME_TYPES` records. **This is a compatibility break, and it is the repo's established practice**: `parseHandshake` refuses any version mismatch outright with "Update janissary so both hosts match", which is what happened at version 18. Land the whole remote group — both frames, their decoders, the version bump and its comment — in one commit; a half-landed version bump breaks every remote tab rather than just this feature.

### 9. Implementation steps

Ordered so that each group leaves the tree typechecking and green. Run `check-diff` after each.

1. `src/harness/auto-resume.ts` with `RESUME_TABLE`, `detectResumeLimit` and `resumeInstant`, plus `src/harness/auto-resume.test.ts`. Pure and self-contained; nothing else depends on it yet.
2. `ScheduleManager.add` with its tests, and `src/harness/auto-resume-state.ts`.
3. `HarnessAutoResumer` and the local wiring: `capture/wire.ts`, `auto-resume-wire.ts`, `runtime.ts`, `observers.ts`, then the `BusyTracker.observe` parked input and `busyStatusHandler`. This group is what makes a local tab behave; verify it before anything is threaded through the launch option.
4. The launch option end to end: `spawn-options.ts`, `tab-spawn.ts`, `manager.ts` (including `openFromProfile`'s default), `command-parse.ts`, `src/tab/types.ts`, `src/tab/view.ts`, `src/protocol/tab.ts`, and the notification event in `src/notifications/`.
5. The client: the launch-dialog checkbox, `harness-launch-command.ts`, `tab-flag-display.ts`, and the typed `HarnessLaunchView` fixtures.
6. The remote group, in one commit as noted above: both frames and their decoders, `serve-processes-detect.ts`, `serve-processes.ts`, `pty-session.ts`, `process-state.ts`, the sessions store/snapshot/attach fields, and the version bump with its changelog paragraph.
7. Specs and docs, in the same change as the code they describe.

Steps 3 and 4 are separable but not independent: step 4's `--no-auto-resume` has nothing to switch off until step 3 exists. Step 6 depends on step 3's observer being callable without `Managers`, which is why the observer takes callbacks.

### 10. Deliberate ceilings

Named so they read as choices rather than oversights:

- **The trailing-row window is three.** A harness whose limit message wraps over more than three rows, or which states the time more than two rows below the limit wording, will not match. Widening the window, or splitting the match across the two halves independently, is the upgrade path when a real screen needs it.
- **Recognition is text-based and silent about change.** A harness that rewords its message simply stops being recognized, with no notification — the same best-effort bargain every existing gate detector makes (`harness.md` § Auto-approve). The registry is where a reworded message is answered.
- **A resume does not survive a restart.** The entry lives in the tab's in-memory schedule, so an app restart during the wait loses it and the tab comes back parked and badged, exactly as a harness tab's own timers do (`scheduling.md`). Persisting it would mean giving harness tabs an agent state file, which is a larger change than this feature.
- **The remote split costs a protocol bump.** Both peers must be on this build for a remote harness tab to work at all, not merely for auto-resume.

## Tests

Mirror the existing per-module suites; every file named here already exists except the two new modules' own suites.

- `src/harness/auto-resume.test.ts` (new): the example text as one row and as the two-row wrap, with **both** apostrophe forms in the limit wording; all three reset forms — `try again at 1:20 PM` / `1:20pm` / `13:20`, `try again at Jul 8th, 2026 10:59 AM`, and `try again in 4 hours 20 minutes` (tokens summed); a date with no time → no match; a duration past 24 hours → no match; the limit wording with no clause → no match; a limit message with unrelated output below it → no match; a harness absent from the table → no match. `resumeInstant`: the one-minute margin, the midnight rollover, a dated reset in the past rolling to next year, and a stated time already in the past clamping to `now + margin` (the case that would otherwise be a day late). The observer: one schedule for a screen redrawn unchanged; a changed screen with a different stated reset schedules once more; a cleared blockage cancels the pending entry and re-arms; `onSettled` clears the pending id and moves the flag from scheduled to resumed; `isParked` is false for an unsupported harness.
- `src/harness/auto-resume-wire.test.ts` (new): the local wiring appends through `ScheduleManager.add` rather than `set` (so an existing entry survives), the notification carries the capture file link, and the flag reaches `resumed` from either hook — a delivery and a withdrawal both mean nothing is pending.
- `src/schedule/manager.test.ts`: `add` appends without disturbing existing entries, replaces one carrying the same id rather than doubling the row, and announces the change; `fired` runs once after a successful delivery and not on a tick where the harness was not running; `removed` runs exactly once for an entry cancelled, cleared or dropped with its tab, and never for an entry replaced through `add`; two tabs whose labels differ only by a suffix keep their hooks apart, and the longer one's entry still fires after the shorter one's schedule was replaced.
- `src/harness/busy-status.test.ts`: a parked tab commits `busy: false, unread: false` on the first capture with no debounce, arms no `harness-idle` escalation, and returns to normal tracking once the resumer reports the entry settled; a limit screen with no usable reset leaves the badge alone; an existing gate and recap case must keep passing.
- `src/harness/command-parse.test.ts`: default on for codex, `--no-auto-resume` opting out, `--auto-resume` refused for claude and opencode with the exact refusal text.
- `src/harness/manager.test.ts` and `src/harness/observers.test.ts`: `Tab.autoResume` is set from the launch and reaches the wiring, a profile entry takes the launch default per harness, and `harnessLaunchView()` carries `autoResume: ['codex']`.
- `src/harness/capture/wire.test.ts`: an ordinary capture reaches the approver, then the resumer, then the busy handler — in that order, since the handler reads the parked state as of the same capture — a settled re-read reaches the busy handler alone, `autoResume` false builds no resumer, and `autoApprove` false still feeds one.
- `src/remote/protocol.test.ts`: `resume-event` round-trips with a base64 capture, `resume-ack` is admitted, and a version-24 peer is still refused by `parseHandshake`.
- `web/src/harness/HarnessLaunchDialog.test.tsx`: the checkbox is enabled, defaulted and labelled for codex; disabled for claude and opencode; `--no-auto-resume` is submitted when unchecked and nothing extra when checked.
- `web/src/shared/AgentTabMeta.test.tsx`: the three flag states render as `Auto-resume`, green `Auto-resuming`, and `Auto-resume` again.
- The typed `HarnessLaunchView` fixtures in `web/src/harness/HarnessLaunchDialog.test.tsx`, `web/src/ws.test.ts` and `web/src/useServerState.test.ts` all gain the new field.
- `src/remote/pty-session.test.ts`, `src/remote/serve-processes.test.ts` and `src/remote/channel/sessions.test.ts`: the spawn frame carries `autoResume`, a `resume-event` becomes a scheduled entry plus a notification plus the flag, delivery sends `resume-ack`, a replayed report whose reset has passed resumes at once, the far side reports a limit instead of acting on it and stops reporting once acknowledged, and a report arriving before its tab is built is held and delivered on attach.
- Regression: the auto-approve, busy-status, observers, screen, schedule, sessions, remote and launch-dialog suites must pass unchanged.

## Specs and docs

Update in the same change, per `AGENTS.md`:

- `product/specs/harness.md` — a new `### Auto-resume after a usage limit` section beside Auto-approve covering the registry, the recognized text with its tail-position and apostrophe rules, all three reset forms and the 24-hour ceiling, the one-minute margin, the parked-tab dot and badge silence, the schedule entry, the flag states and the notification; the launch-dialog bullet gains the Auto-resume checkbox; § Busy/ready status gains the parked rule beside the existing gate rule; § Screen capture notes the resumer as a capture consumer that never sees the settle capture; the harness tab-data list gains the new field.
- `product/specs/notifications.md` — the `auto-resume` event and its capture link.
- `product/specs/scheduling.md` — a new section for the entry the app adds for itself: appended beside the tab's own timers, replaced by id rather than doubled, cancellable by the user, and reachable only through the `in <tab>` clause.
- `product/specs/remote-server.md` — the far-side detection split, beside the version-18 gate/busy description.
- `product/specs/profiles.md` — that a harness entry has no `autoResume` field, so the launch default applies to a profile-opened tab.
- `help.md` and `documentation/user-documentation/advanced-agents/harness.md` — the launch option, the flag and its three states, what a parked tab looks like, and the cancel command with the `in <tab>` clause it needs; `documentation/user-documentation/tab-types/notifications.md` gains the new capture link; the New harness dialog screenshot is recaptured for the new toggle.

## Autonomous decisions taken while building

Recorded here rather than silently, because each one departs from what this plan said above:

- **`resumeInstant` does not reuse `nextOccurrenceOfTime`/`nextDateTime`.** The plan pointed at both, and the test line even claimed a dated reset in the past rolls to next year. Both roll a past value forward a whole day or a whole year, which is the day-late and year-late failure this feature exists to prevent — codex prints its reset without seconds, so a limit hit at 7:36:15 against a 7:36:40 reset states a time that has already gone. Every reset therefore resolves against its own date (this year for a dated one) and a past instant clamps to `now + margin`. The reuse claim above stands for the *parsers* — `parseTimeOfDay`, `parseMonthDay`, `parseInterval` — and not for the occurrence math.
- **The apostrophe rule is met by not matching an apostrophe.** The pattern anchors on `hit your usage limit`, which both codex spellings contain, so the typographic and ASCII forms match without the pattern naming either. The requirement is satisfied by a superset of what the plan described.
- **The `resume-event` frame carries the parsed reset, not the clause text.** `ResumeReset` is plain JSON, so carrying it removes a serialize-then-reparse round trip that could only drift from the parser. The reason the reset travels unresolved — only the client owns the clock and the schedule — is unchanged.
- **`resume-ack` is sent on delivery only, not on cancellation.** Nothing on the client watches a remote tab's screen, so the only cancellation it can perform is a user's own `schedule cancel auto-resume`; the far side re-arms by seeing its screen change, which is the same rule a local observer follows. Adding a cancel hook to `ScheduleManager` for that would be a second hook with one speculative caller.
- **`resumeEntry` lives in `src/harness/auto-resume.ts`, not the wire module.** Two callers build the identical entry — the local wiring and a remote session's replayed report — so it belongs beside the prompt and the id it is made of rather than in one of them.

- **A pending resume the user withdraws reports it too.** `ScheduleManager.add`'s hook pair carries `removed` alongside `fired` so that `schedule cancel auto-resume in <label>`, a `clear`, or a closing tab all put the strip back to plain `Auto-resume`. Without it a cancelled entry left the tab claiming a pending resume that would never be typed. An entry *replaced* through `add` reports neither: it was never removed, and it is still on the schedule under its new instant.

## Verification

The parts a machine without a codex subscription to exhaust can still check: the launch dialog offering Auto-resume for exactly the harnesses the parser accepts it for, `harness claude --auto-resume` refused, an armed codex tab carrying an unhighlighted `Auto-resume` bolt, a `--no-auto-resume` tab carrying none, `schedule cancel auto-resume in <label>` answering on a tab with no such entry, and a user timer reaching the same harness tab through `in <tab>`.

```bash
./scripts/run.mjs check-diff
```

Manual check: open a `codex` harness tab, let it hit a usage limit, and confirm the tab parks with its dot stopped and no unread badge and no `harness-idle` notification, a scheduled `auto-resume` row appears in the tab's schedule window (and in `schedules`) for one minute past the stated time with the command `resume the task you were working on.`, the flag reads green `Auto-resuming` and then plain `Auto-resume`, the prompt is typed into the harness when it fires, and the tab badges normally if it goes idle again while hidden. Then confirm the recovery path: clear the blockage by hand before the instant and the row disappears.

## Out of scope

- claude and opencode. claude resumes by itself (`autoContinueAtUsageLimit`, on by default for subscription accounts), so a detector would duplicate it. opencode is excluded for a different reason: on a subscription limit it hangs mid-generation and prints nothing to recognise (anomalyco/opencode#2512, #5425, #5204). Neither earns a registry row.
- Reading a limit out of an agent tab's ACP transcript. The `rate-limited` notification event is unchanged.
- Fleet-wide parked-state reporting — a badge naming each tab's reset time, a header summary of how many tabs are parked, a countdown dashboard. `product/backlog/features.md` records that as declined in favour of this feature.
- A tab whose limit names a duration longer than 24 hours — recognised, deliberately not scheduled, and badged as it is today. Raising that ceiling is a one-constant change to the arm that sums the duration.
- Persisting the setting in a profile. A profile harness entry has no `autoResume` field, so a profile-opened codex tab gets the default and a `--no-auto-resume` tab saved into a profile reopens with auto-resume on.
- A user command to arm, list or cancel a resume. The entry is visible and cancellable through the existing `schedule list` / `schedule cancel` and the schedules tab.
- A second attempt against the same blockage, and any backoff. One resume per blockage was chosen over the bounded retry every mature wrapper ships (`autolimit` retries 60s/120s/240s while the banner persists; `unsnooze` caps at five attempts) because the stated reset is approximate and a retry against a wall the user has to clear — `upgrade your plan`, `Quota exceeded` — types at a human's decision. A tab the app cannot recover is the user's from then on.
- Transient API overload and 429 throttling — a harness that dies on `API Error: 529` or a short-backoff rate limit, recovered by exponential backoff with jitter and a cumulative cap, which the wrappers treat as a path distinct from the hours-scale usage wait this feature handles. It is a resilience feature with no screen text naming a time, so it needs its own detector and its own state machine.
- Delivering the resume to a harness that exited on the limit. The tab takes its in-memory schedule with it, so the entry is lost; `autolimit` and `unsnooze` relaunch non-interactively instead (`codex exec resume --last '<message>'`). In Janissary that is a new relaunch path with its own argument handling, colliding with the existing remote relaunch machinery.
- A stalled-harness detector. opencode does not in fact resume by itself on a subscription limit — it hangs mid-generation and never prints anything (anomalyco/opencode#2512, #5425, #5204), so there is no screen text for a detector to match and the tab's dot blinks forever. That is a different signal from a recognised blockage and would ship without auto-resume riding on it.
- Continuing a response truncated at `max_tokens`. Not a blockage, and it states no time; exact for an agent tab through ACP's `stopReason: length`, but invisible on a harness screen, and it shares only the delivery half with this plan.
- A resume for a limit screen that states no usable reset — no clause at all, or a form the 24-hour ceiling refuses. The tab is recognised and badged; nothing is scheduled.