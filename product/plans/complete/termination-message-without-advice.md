# Termination message without the advice clause

Issue: remove "— create a new agent or shell to continue" from error messages and notfications.

Complexity rating: 2/10

## Goal

A confirmed remote termination currently announces itself with an instruction attached:

```
Remote janus on devbox terminated — create a new agent or shell to continue.
```

The advice is a guess the app has no standing to make, and it rides along everywhere the sentence does — the tab's log line, the harness's `exited` status in place of the exit code, and the `remote-session-terminated` notification. Drop the clause so every one of them reads:

```
<what> on <host> terminated.
```

That is the same shape the sessions tab's own termination line already uses, so one ending no longer has two wordings.

## Approach

Two server sites build the sentence, and both drop the clause:

- `src/remote/attach.ts`'s `terminateRemoteSession` — the single generator for the tab log line, the harness status, and the notification raised alongside it.
- `src/remote/manager-closed.ts`'s `remoteChannelClosed` — its own notification for a joined label, where the entry's own tabs were already settled by whoever closed the channel.

Both are literal text edits; no signature, control flow, or wire field changes. `sessionTerminated` keeps carrying the sentence verbatim in every consumer (`src/tab/view.ts` gates on its presence, `web/src/harness/HarnessTab.tsx` renders it in place of `exited`), and nothing parses the removed tail, so no downstream code needs to know.

The event distinction the specs draw between `remote-session-terminated` (a session that ended on its own) and `remote-session` (a decision the user made from the sessions tab) survives the change: the two still name different things — `Remote janus` / `Remote harness '<label>'` / `Remote shell` against the session row's own name — and only one of them is raised for an ending the user did not ask for.

## Implementation steps

1. `src/remote/attach.ts`: `terminateRemoteSession`'s `text` becomes `${what} on ${host} terminated.`
2. `src/remote/manager-closed.ts`: the notification detail becomes `Remote janus on ${entry.address.host} terminated.`
3. Update the fixtures and assertions that pin the old sentence:
   - `src/remote/attach.test.ts` — the refusal test's expected `sessionTerminated`.
   - `src/tab/view.test.ts` — the `sessionTerminated` pass-through fixture.

## Tests

- `src/remote/attach.test.ts`: the existing refusal test asserts the exact sentence, so it now pins `Remote janus on devbox terminated.`
- `src/tab/view.test.ts`: the view pass-through fixture carries the new sentence.
- New in `src/remote/attach.test.ts`: a per-process termination's notification detail and the tab's `sessionTerminated` are the bare sentence — no `—` clause — for both a harness and a plain shell, so a future re-add of the advice fails here rather than passing on the substring assertions the neighbouring tests use.

## Out of scope

- The notification's event type, eligibility, or focus-suppression classification.
- What a terminated tab does (it stays open, keeps its transcript, nothing relaunches).
- `web/src/harness/HarnessTab.test.tsx`'s display fixture, which carries an older `ended — start a new …` wording: it stands for a verbatim pass-through of whatever the server sent, and the server has not produced that sentence since the terminology change.
- The `remote-session` lines the sessions tab raises for a user-driven termination, which already read `<what> on <host> terminated.`
- `product/plans/complete/*.md` history, which records the wording as it stood when those plans shipped.

## Specs and docs

- `product/specs/notifications.md`, `product/specs/remote-server.md`, `product/specs/sleep-and-resume.md`: the `remote-session-terminated` sentence loses the clause.
- `documentation/user-documentation/getting-started/sleep-and-resume.md`: the example message in place.
- `help.md`: checked — it does not carry the sentence.
