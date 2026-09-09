# Report an unsupported file type in the notifications feed

**Complexity: 4/10** — one new explicit notification event, one changed call site in the `open` dispatcher, and the tests, spec, and doc lines that place the message in a tab's transcript. No contract change, no client change.

## Goal

`No opener for ".xyz" files.` stops being a transcript line and becomes a notification. Today the dispatcher appends it to the originating tab's log, which for a file navigator activation is a view tab that renders rows rather than a transcript — the message is written where nobody reads it. Routing it to the notifications feed puts it where the app already collects diagnostics that have no natural home in a transcript.

## Approach

1. **A dedicated event, not `file-operation`.** The notification event union is exhaustive by design: `EXPLICIT_EVENTS` is keyed by it so a new member stops compiling until it is classified, and `notificationText` switches over it without a `default` arm. Reusing `file-operation` would hide an `open` failure behind an event the spec defines as a file navigator copy/paste/move/delete/undo/pull outcome, and this message reaches the dispatcher from the command line just as often as from a tree row. `open-unsupported` names what actually happened.

2. **Explicit, not ambient.** The user asked for this file to open, so the report is the answer to a deliberate action rather than background chatter. That makes it an explicit event: no config toggle, and no focus suppression — the tab it happened in is very often the tab being watched, which is exactly the case focus suppression would discard.

3. **The message text is unchanged.** `No opener for ".xyz" files.` is what the spec and the docs already quote, and what a user searching for the message would type. Only where it lands changes. The notification header already supplies the originating tab and the time, so nothing needs to be added to the message to keep it attributable.

4. **The rest of the dispatcher's errors stay in the transcript.** A missing file, a malformed invocation, an unviewable web address, and a pinned command's refusal are all reported where the command was typed. Only the unsupported-type line moves, because it is the only one of them a file navigator activation can produce.

5. **One consequence is accepted, not worked around: the feed drops what it receives while closed.** That is the notification system's own rule, and it applies to every event equally — an unsupported type reported while the feed is closed is not recorded anywhere. This plan does not carve out an exception for one event; whether a notification should open the feed is a question about the feed, not about `open`.

## Implementation steps

1. `src/notifications.ts`: add `'open-unsupported'` to `NotificationEventType` with a comment placing it beside the other explicit events, add it to `EXPLICIT_EVENTS`, and give it a `notificationText` case returning the detail verbatim, alongside the other events whose body is the message alone.

2. `src/open/file-manager.ts`: in `openOne`, replace the `managers.tab.append` of the unsupported-type line with `notify(this.managers, 'open-unsupported', label, …)`, keeping the same text. The pinned-command path reports through the same call, since a pinned command reaching an unclaimed extension produces the same message today.

## Tests

`src/open/file-manager.test.ts` — mock `../notifications.js` the way the file already mocks `../openers/os-open.js`, and update the two tests that assert the transcript entry:

- An inline `open` of an unclaimed type raises an `open-unsupported` notification carrying `No opener for ".pdf" files.` for the originating tab, and appends nothing to that tab's transcript.
- A pinned command (`video external paper.pdf`) reports through the same notification and still never reaches the OS handler.

`src/controller.test.ts` (the existing "reports no opener for an unsupported file type" test):

- With the notifications tab open, `open notes.xyz` records `No opener for ".xyz" files` in the feed rather than in the issuing tab's transcript.
- With the feed closed, the same command records nothing and creates no notifications tab, matching the drop-if-closed rule every other event follows.

## Out of scope

- Whether a notification should open the feed when it is closed — that is the notifications tab's own behavior and is the next backlog issue.
- The dispatcher's other errors (missing file, usage, unviewable address, pinned refusal), which stay in the transcript where the command was typed.
- Changing the message text, adding the file's name to it, or giving the notification a link that opens anything.
- Any config toggle for the new event; explicit events have none.
