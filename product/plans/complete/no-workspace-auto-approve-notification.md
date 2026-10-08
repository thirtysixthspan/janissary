# Deliver the no-workspace auto-approve warning as a notification

**Complexity: 4/10** — the warning already exists as a pure string
(`autoApproveWithoutWorkspaceWarning`) and is already computed at spawn time, but it is delivered by
appending to the harness tab's transcript, and a harness tab renders its PTY rather than its
transcript, so the line is written where nobody can see it. The fix moves that one delivery onto the
existing notifications path: one new explicit event type, its classification entries, and one call
site. No new architecture, no protocol change, no state.

## Goal

`harness claude --no-workspace -y` (and the profile-entry equivalent) is supposed to warn the user
that auto-approval is running against their real files with no sandbox. Observed: the warning
appears nowhere — not in the terminal, not in the tab's asciicast recording, not in the
notifications feed — because `HarnessTabSpawn.finishSpawn` hands it to `managers.tab.append`, and a
harness tab's body is its PTY (xterm), never its transcript log. The line is dropped into an
invisible log.

The warning should be a notification: it reaches the feed, a toast, the record file, and a desktop
alert/bell through machinery that already exists, and it is the surface every other launch-time
report already uses.

## Approach

Add one explicit notification event, `auto-approve-no-workspace`, whose message is the existing
warning text, and raise it from `finishSpawn` instead of appending to the tab's log.

- A harness tab renders `HarnessTab` (metadata row + xterm body) and never the transcript, so the
  append is the bug, not the surface. The sandbox notice beside it (`sandboxNotice()`) has the same
  delivery, but changing it is out of scope here.
- A dedicated event rather than reusing `auto-approve`: that event means a permission gate was
  cleared, this one means a tab launched in a risky configuration. The queue's repeat folding keys
  on tab + message, but the record file's `event` field is the durable grep-able trail, and a
  security warning filed as an auto-approval would be a lie in it.
- The event is **explicit**: no config toggle, and it bypasses focus suppression. The tab it is
  attributed to is the one just launched, which is very often the active one — exactly the case
  focus suppression would discard, and the same reasoning that keeps the recording-failed and
  browser-gone events explicit. Its bell is `warning.mp3`, the category `auto-approve` itself
  already uses.
- Registration is compile-enforced at every step: the union member forces an `EXPLICIT_EVENTS`
  entry, which forces a `CATEGORIES` entry, and the exhaustive `notificationText` switch forces a
  text case. The table-driven tests in `src/notifications/index.test.ts` and
  `src/notifications/native.test.ts` pick the new event up automatically.

## Implementation steps

1. **`src/notifications/index.ts`**: add `'auto-approve-no-workspace'` to `NotificationEventType`,
   add `'auto-approve-no-workspace': true` to `EXPLICIT_EVENTS`, and extend the header comment
   that lists the explicit events with a sentence naming it.
2. **`src/notifications/sound-category.ts`**: add `'auto-approve-no-workspace': 'warning'`.
3. **`src/notifications/format.ts`**: add the event to the `detail ?? ''` case group (with `manual`
   and `auto-approve`) and name it in the `notificationText` doc comment.
4. **`src/harness/tab-spawn.ts`**: in `finishSpawn`, split the single `notice` ternary into the two
   deliveries it was conflating — the sandbox/remote notice keeps its transcript append, the
   no-workspace auto-approve warning becomes `notify(this.managers,
   'auto-approve-no-workspace', label, warning)`. The remote branch keeps precedence: a remote tab's
   workspace is the far host's, so there is nothing to warn about locally.

## Tests

`src/harness/manager.test.ts`, in the existing `HarnessManager auto-approve` describe:

- `harness claude --no-workspace -y` notifies with `'auto-approve-no-workspace'`, the tab label,
  and the warning text from `autoApproveWithoutWorkspaceWarning(true)`, and does not append a
  transcript entry for it.
- `harness claude --no-workspace --no-auto-approve` notifies with nothing.
- `harness claude -w -y` (workspaced) notifies with nothing for this event — the workspace confines
  the harness.

The table-driven blocks in `src/notifications/index.test.ts` and `src/notifications/native.test.ts`
already cover the classification, the text, and the sound category for every explicit event.

## Spec updates

- `product/specs/harness.md`: replace the promise that "a security warning line appears in the new
  tab's terminal" with the notification it is: the warning is recorded in the notifications feed,
  attributed to the new tab, with a toast and a bell, and nothing is written to the tab's terminal
  or its recording.
- `product/specs/profiles.md`: the `autoApprove` entry's "the launched tab's terminal shows a
  security warning" becomes the same notification.
- `product/specs/notifications.md`: add the `auto-approve-no-workspace` bullet to the event list and
  name it in the three lists an explicit event belongs to — no toggle, bypasses focus suppression,
  raises a desktop alert and bell.

## Docs

- `documentation/user-documentation/advanced-agents/harness.md`: the sentence saying the new tab's
  terminal shows a security warning becomes the notifications-feed warning.
- `help.md`: nothing — it documents the flags, not the warning.

## Out of scope

- The sandbox notice's delivery (`sandboxNotice()` appended to the same invisible log), and the
  remote host's notice, which have the same flaw.
- Writing the warning into the tab's terminal or asciicast recording: a harness tab's screen is the
  PTY's own, and nothing the app appends reaches either.
