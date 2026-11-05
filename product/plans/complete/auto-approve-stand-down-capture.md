# Auto-approve stand-down carries a screen capture

Issue: when the auto-approve can not clear the permission prompt, a snapshot should be taken and associated with the notification.

Complexity rating: 2/10

## Goal

When auto-approve sends its keystroke and the same permission gate redraws unchanged, `HarnessAutoApprover` stands down and records `<label>: Auto-approve could not clear the permission prompt; standing down`. That line has no capture today, so the user who comes back to a stuck tab can't see which prompt defeated auto-approve without switching to the tab. Attach the screen capture that triggered the stand-down to the notification, exactly as a successful approval already attaches its capture, so the line carries the same clickable capture link that opens the captured text in an editor tab.

## Approach

The approver's `notify(message, capture?)` callback already writes a capture file and links it whenever a capture is passed (`buildAutoApprover` locally, the `gate-event` frame's optional `capture` remotely). The stand-down path simply calls `notify` without one. Passing the current capture there is the whole local fix.

The remote side needs one more change. `src/remote/pty-session.ts`'s `onGateEvent` uses "a capture is present" as its signal that the far side approved a prompt, and lights the tab's auto-approve flag on it. Once a stand-down also carries a capture, that signal is wrong. Key the flag on the message instead: export the two message strings from `src/harness/auto-approve.ts` as constants (`AUTO_APPROVED_MESSAGE`, `AUTO_APPROVE_STUCK_MESSAGE`) and light the flag only for `AUTO_APPROVED_MESSAGE`. The approver uses the same constants, so the local and remote sides can't drift on the wording.

No wire change: `gate-event` already carries an optional `capture`, so no protocol version bump is needed. Mixed versions stay safe. A newer client talking to an older remote gets a stand-down with no capture and shows no link, as today. An older client talking to a newer remote would light the flag on the stand-down, but a stand-down always follows an approval of the same gate, which already lit it.

Rejected alternative: a new `stuck` boolean on `gate-event`. It would need a protocol bump and decoder changes to say what the message already says.

## Implementation steps

1. `src/harness/auto-approve.ts`: export `AUTO_APPROVED_MESSAGE` and `AUTO_APPROVE_STUCK_MESSAGE`; use them in `HarnessAutoApprover.onCapture`, passing `capture` on the stand-down notification too. Every report now has a capture, so the `notify` option's `capture` parameter becomes required. Update the class comment.
2. `src/harness/auto-approve-wire.ts` and `src/remote/serve-processes-detect.ts`: drop the now-dead "no capture" branches in their `notify` callbacks (always write the capture file; always put `capture` and its `capturedAt` on the `gate-event` frame). Update the wire comment.
3. `src/remote/pty-session.ts`: light the auto-approve flag when `message === AUTO_APPROVED_MESSAGE` rather than when a capture is present; update the `onGateEvent` comment. Its capture-absent branch stays, because an older remote still sends a stand-down without one.

## Tests

- `src/harness/auto-approve.test.ts`: the stand-down notification is called with the stuck capture as its second argument.
- `src/harness/auto-approve-wire.test.ts`: a stand-down writes a capture file and passes it as the notification's `openFile`.
- `src/remote/serve-processes.test.ts`: the stand-down `gate-event` frame carries the gate's screen text as `capture`.
- `src/remote/pty-session.test.ts`: a stand-down `gate-event` with a capture writes the capture file and links it, and leaves the tab's auto-approve flag unlit.

## Out of scope

- Captures for a gate that is still waiting on the user with auto-approve off.
- Any change to the stand-down's loop guard, the busy/unread flagging, or the notification wording.
- The `gate-event` frame shape and `REMOTE_PROTOCOL_VERSION`.

## Specs and docs

- `product/specs/harness.md`: the capture-link paragraph and the stand-down paragraph now say the stand-down carries its own capture link.
- `product/specs/notifications.md`: the `auto-approve` type's entry covers the stand-down and its capture link.
- `documentation/user-documentation/tab-types/notifications.md`: its list of lines that carry a file icon gains the stand-down. `documentation/user-documentation/advanced-agents/harness.md` doesn't describe the stand-down line itself, so it is left alone rather than given new documentation.
- `help/`: checked; it doesn't describe capture links, so no update expected.
