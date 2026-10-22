# Auto-approval prompt notification type

**Complexity: 2/10** — pure wiring: one new explicit union member that the compiler forces into three tables, a type choice at two existing `notify` call sites, and test assertions that move with it. No protocol, client, or config-code change.

Backlog text: "assign auto-approval prompt notifications a new notification type, and allow this type to be configured in config.json. The default should be no audio notification."

A harness running with auto-approve can clear dozens of permission prompts in a session, and each one plays the warning cue today. That's the same cue a `question` or a `harness-idle` escalation uses, so the sound that should mean "come look" is spent on something the app already handled. Moving those lines to a new `auto-approved` type lets them default to silence. Users who want the cue back can set it in `.janissary/config.json` without touching the other types.

## Design decisions

Established by the feature text:

- Auto-approval prompt notifications get a new notification type of their own.
- The new type is configurable in `.janissary/config.json`.
- The new type's default plays no audio: its `sound` is `"none"`.

Settled with the user:

- The new type is named `auto-approved`. That's its key in `notifications.alerts` and the `event` field of its lines in `.janissary/notifications.json`.
- Only successful approvals move to `auto-approved`. `Auto-approved a permission prompt` is the line that repeats on every cleared prompt. The stand-down line, `Auto-approve could not clear the permission prompt; standing down`, stays on `auto-approve` and keeps that type's warning cue, because it means the harness is blocked and needs the user.
- `auto-approved` defaults to a desktop banner with no sound: `{ "desktop": true, "sound": "none" }`. Only the audio goes away. The banner can be switched off in config like any other type's.
- "Configured in config.json" means the `auto-approved` entry in `notifications.alerts` and nothing more. There's no `notifications.events` toggle. Like `auto-approve`, it's explicit: every approval always reaches the queue, the record file, the feed, and a toast, and it bypasses focus suppression.
- No other type's default changes. `auto-approve` (now only the stand-down), `auto-approve-no-workspace`, and `auto-resume` keep `{ "desktop": true, "sound": "warning" }`.
- An existing config file gains the silent default. When startup backfill adds `auto-approved` to a file that lacks it, it writes `{ "desktop": true, "sound": "none" }`. The file's existing `auto-approve` entry is left exactly as written and from then on governs only the stand-down. A customized `auto-approve` entry isn't copied into the new type.
- Both message texts stay exactly as they are. Feed lines, toasts, banners, and record-file messages read the same as today. Only the `event` an approval line is filed under changes.

Established by existing behavior:

- Since #1768, every notification type has a `notifications.alerts` entry with a `desktop` switch and a `sound` choice (`success`, `warning`, `error`, or `none`). The defaults come from `NOTIFICATION_ALERT_DEFAULTS` in `src/notifications/alert-defaults.ts`. A new member of `NotificationEventType` gets an alerts entry, field-by-field decoding, and startup backfill without any new config code.
- The startup backfill (`backfillNotificationAlerts` in `src/config-decode.ts`) writes a missing type's default into an existing config file and never rewrites an entry that's already there. Fresh config files list every type. So a config file written or loaded since #1768 already holds an explicit `"auto-approve": { "desktop": true, "sound": "warning" }`. Changing the `auto-approve` default alone would not reach those files. A new type name is what lets the silent default land in existing configs.
- Today the `auto-approve` type carries both messages, both raised through `HarnessAutoApprover` (`src/harness/auto-approve.ts`). The approval passes a screen capture, and the stand-down passes none.
- Both messages reach `notify()` from two call sites: `buildAutoApprover` in `src/harness/auto-approve-wire.ts` for a local harness, and the `onGateEvent` handler in `src/remote/pty-session.ts` for a remote one. The remote `gate-event` frame carries the message text and an optional capture, and the capture's presence already tells an approval from a stand-down (it's what lights the tab's auto-approve flag).
- `auto-approve` is explicit: it has no `notifications.events` toggle, and it bypasses focus suppression. A replayed remote notification never raises a desktop alert or a sound, whatever its alerts entry says.
- The `osNotifications` and `terminalBell` master switches and the three volume settings apply to every type's configured banner and cue. A banner-only alert carries no cue name and doesn't use up the client's one-second bell throttle, so a stand-down right after a run of silent approvals still plays its cue.
- Repeat folding keys on tab and message, not event type. A run of approvals still folds into one feed line with one capture icon per approval.

## What already exists (reuse, don't rebuild)

| Piece | Where | Reuse |
| --- | --- | --- |
| Notification event union and explicit classification | `NotificationEventType`, `EXPLICIT_EVENTS` in `src/notifications/index.ts` | Add `auto-approved`. The `Record` keyed by the union forces its classification. |
| Per-type alert defaults | `NOTIFICATION_ALERT_DEFAULTS` in `src/notifications/alert-defaults.ts` | Add its default. Decode, backfill, and delivery pick it up. |
| Alert decode and backfill | `notifications()` and `backfillNotificationAlerts` in `src/config-decode.ts` | Unchanged. They iterate over the defaults map. |
| Alert selection at delivery | `deliverNotification` in `src/notifications/deliver.ts` | Unchanged. It reads `alerts[event]`. |
| Message body | `notificationText` in `src/notifications/format.ts` | Add `auto-approved` to the `detail ?? ''` case group. The exhaustive switch forces it. |
| Local approver wiring | `buildAutoApprover` in `src/harness/auto-approve-wire.ts` | Choose the type at the `notify` callback. |
| Remote gate-event translation | `onGateEvent` in `src/remote/pty-session.ts` | Choose the type from whether a capture is present. No protocol change. |
| Precedent for adding an explicit type | `product/plans/complete/no-workspace-auto-approve-notification.md` | Same registration steps, except its `src/notifications/sound-category.ts` step: that file is gone, and `NOTIFICATION_ALERT_DEFAULTS` replaced it. |

## Proposed changes

One new explicit `NotificationEventType` member, `auto-approved`, registered the way `auto-approve-no-workspace` was.

Code (one change: adding the union member fails typecheck until the three tables keyed by it are filled, so land them together):

- `src/notifications/index.ts`: add `'auto-approved'` to `NotificationEventType` and `EXPLICIT_EVENTS`, each directly after `'auto-approve'`. Extend the header comment that names each explicit event, and the comment above `EXPLICIT_EVENTS`: `auto-approved` is a cleared permission prompt, and `auto-approve` is now the stand-down on a prompt auto-approve could not clear.
- `src/notifications/alert-defaults.ts`: add `'auto-approved': { desktop: true, sound: 'none' }` between `'auto-approve-no-workspace'` and `'auto-resume'`. The position matters. A fresh config file is written in this map's insertion order, and `writes notification alert defaults alphabetically in a fresh config` in `src/config.test.ts` asserts that order is `localeCompare`-sorted, which puts `auto-approved` exactly there.
- `src/notifications/format.ts`: add `case 'auto-approved':` to the `detail ?? ''` group beside `case 'auto-approve':`, and name it in the `notificationText` doc comment.
- `src/harness/auto-approve-wire.ts`: `buildAutoApprover`'s `notify` callback calls `notify(managers, 'auto-approve', label, message, { openFile })` today, after `const openFile = capture ? writeCaptureFile(…) : undefined`. Choose the event from the same `capture` check: `auto-approved` when a capture is present, `auto-approve` when it isn't. `HarnessAutoApprover.onCapture` (`src/harness/auto-approve.ts`) passes a capture with `'Auto-approved a permission prompt'` and none with the stand-down, so the capture is the discriminant. Don't match on the message text.
- `src/remote/pty-session.ts`: in `onGateEvent`, apply the same rule beside the existing `capture === undefined ? undefined : writeCaptureFile(…)` check: a gate event with a capture is `auto-approved`, and one without is `auto-approve`. A replayed frame keeps its capture (`src/remote/channel/sessions.ts` passes `frame.capture` on both the live and the held path), so a replayed approval is filed as `auto-approved` too.

Write the choice inline at each of the two sites. Each already branches on the capture right there, and a shared helper for one ternary would be a module with a single expression in it.

No protocol change, no client change, and no new config code. The far side keeps sending the same `gate-event` frame (`message`, `capturedAt`, optional `capture`), and the local side classifies it. So don't add a field to the frame or bump `REMOTE_PROTOCOL_VERSION`. A local janus talking to an older remote host files its approvals correctly with no version negotiation.

Specs:

- `product/specs/notifications.md`: split the `auto-approve` bullet under "Events that notify" into `auto-approved` (a `-y` harness auto-approved one of its permission prompts) and `auto-approve` (auto-approve stood down on a prompt it could not clear). Add `auto-approved` beside `auto-approve` in the three lists that enumerate explicit events: the no-toggle list under "System schedule notices", the bypass list under "Focus suppression", and the "This includes …" list under "Desktop alerts and bell sounds". In that section's default-cue paragraph, say `auto-approved` defaults to a banner with no cue, while `auto-approve` stays on `warning.mp3`.
- `product/specs/harness.md`: rename the type at the two places it's named. In the claude paragraph, "records an `auto-approve` notification, rendered as `<label>: Auto-approved a permission prompt`" becomes `auto-approved`. In the queue-and-toast sentence, "the `auto-approve` line is held in the notification queue" becomes `auto-approved`. The codex, opencode, and stand-down sentences name no type and stay as they are.

User docs:

- `documentation/user-documentation/tab-types/notifications.md`: in "Desktop banners and bell sounds", beside the sentence on ambient and system-schedule defaults, say auto-approved prompts show a banner with no sound by default, and that `auto-approved` is the key to change it.

## Tests

Existing assertions that fail after the change and must move to `auto-approved`:

- `src/harness/manager.test.ts`, `describe('HarnessManager auto-approve')`: the three `expect(notify).toHaveBeenCalledWith(managers, 'auto-approve', …, 'Auto-approved a permission prompt', …)` assertions become `'auto-approved'`. The `never injects into a gate when -y is not given` case's `not.toHaveBeenCalledWith(managers, 'auto-approve', …)` becomes `'auto-approved'` as well, so it still names the event an approval would raise.
- `src/remote/pty-session.test.ts`, `describe('createRemotePtySession')`: `translates a live gate-event frame into notify() with no detection time, and writes the capture file` and `translates a gate-event frame replayed on reattach into notify(), stamped with the original detection time` now expect `'auto-approved'`. `translates a live gate-event frame with no capture into notify() with no open file` (the stand-down) keeps `'auto-approve'`. Together those three pin the capture rule on the remote path.
- `src/notifications/native.test.ts`, `provides defaults for every explicit and ambient event`: it asserts every explicit event defaults to a sound other than `'none'`. Skip `auto-approved` in that loop and assert its default is `{ desktop: true, sound: 'none' }`.

New test (the local path's stand-down has no coverage today, so nothing else pins the capture rule there):

- `src/harness/auto-approve-wire.test.ts`, `describe('buildAutoApprover')`: it already mocks `notify` and `writeCaptureFile`. Add one case: a gate capture notifies `(managers, 'auto-approved', 'bot', 'Auto-approved a permission prompt', { openFile: '/project/.janissary/captures/bot-now.txt' })`, and feeding the identical gate text again (the stand-down `HarnessAutoApprover` raises on an uncleared gate) notifies `(managers, 'auto-approve', 'bot', 'Auto-approve could not clear the permission prompt; standing down', { openFile: undefined })`.

Already covered, no new test: delivery of a `sound: 'none'` alert as a banner with no `category` (`alerts for ambient events only when opted in and configured` in `src/notifications/native.test.ts`), and backfill filling a missing type with its default while keeping a customized present entry (`replaces malformed alerts and fills only missing types without changing present entries` in `src/config.test.ts`). The backfill has no per-type logic, so `auto-approved` needs no case of its own.

Left unchanged: the `src/notifications/index.test.ts` cases and `native.test.ts`'s replay case that use `auto-approve` as a representative explicit event. They keep passing because `auto-approve` stays explicit.

## Out of scope

- Changing how permission prompts are recognized or answered.
- Changing the defaults of `auto-approve` (the stand-down), `auto-approve-no-workspace`, or `auto-resume`.
- A `notifications.events` toggle for `auto-approved`. The feed line always records.
- Changing either message's text.
- Copying a customized `auto-approve` entry into `auto-approved`.
- Rewriting lines already in `.janissary/notifications.json`. Approvals recorded before this change stay filed under `auto-approve`.
- Changing the in-app feed, toast, or folding behavior.

## Verification

- `$janissary/scripts/run.mjs check-diff`
- Manual: start the app against a project whose `.janissary/config.json` already lists `auto-approve` with the warning cue. After startup, the file's `alerts` map gains `"auto-approved": { "desktop": true, "sound": "none" }`. Backfill appends it after the entries already there, not in alphabetical position. `auto-approve` is unchanged. Launch `harness claude -w -y` in a background tab and trigger a permission prompt. The feed records `Auto-approved a permission prompt` with its capture link, a banner shows with no cue, and `.janissary/notifications.json` files the line under `"event": "auto-approved"`. Set `auto-approved`'s `sound` to `"warning"`, restart, and confirm the next approval plays the warning cue.
