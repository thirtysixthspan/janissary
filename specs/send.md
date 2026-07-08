# `send` command

`send <label> <text>` delivers a line of input to any named tab. Unlike `msg`/`broadcast`,
which deliver a *message* into another agent's inbox, `send` delivers the text as if it had
been typed directly at the target — the delivery mechanism depends on the target tab's kind.

## Command

```
send <label> <text...>
```

- `label` — the target tab's label (`claude`, `opencode`, `claude-2`, an agent name, …).
- `text` — the input to deliver as a single line.

Parsed by `parseSendCommand` in `src/commands/send.ts`; dispatched by the `send` command in
the same file.

- `send` (no args) — error: `Usage: send <label> <text>`
- `send claude` (no text) — error: `No text to send.`
- `send claude /standup` — delivers `/standup` to the tab labeled `claude`.

## Routing by tab kind

| Target tab kind | Delivery |
| --- | --- |
| Harness (`view === 'harness'`, `harness.status === 'running'`) | `ptyInput(harness.ptyId, text + '\r')` — raw keystrokes into the PTY, followed by a carriage return so the harness executes the line (matches xterm's own Enter key). |
| Agent (`view` undefined or `'agent'`) | `dispatchTo(label, text)` — runs `text` as a command in that tab's own command pipeline; queues behind whatever else is queued if the target is currently busy (see [[agent-command-queue]]). |
| Harness that has exited | error: `Tab "<label>" is not a running harness.` |
| Image / page / markdown view | error: `Tab "<label>" does not accept input.` |
| No such tab | error: `No tab named "<label>".` |

## Output

On success, the sender's transcript records:

```
→ claude: /standup
```

Errors from the routing table above are appended to the **sender's** transcript, so a failed
send — interactive or scheduled — is always visible. `send` is fire-and-forget: there is no
read-back of the target's output into the sender's transcript. Harness output stays in its
own xterm buffer; agent output stays in the target tab's own transcript.

## Composing with `schedule`

`send` is an ordinary command, so `schedule` composes with it unchanged — the scheduler stores
`send <label> <text>` as the entry's command and dispatches it into the *owning* tab (the tab
that ran `schedule`), which runs `send` and forwards to the target:

```
schedule standup every day at 9am send claude /standup   → types /standup into the claude harness every morning
schedule sweep   every 1h        send worker db vacuum    → runs `db vacuum` in the worker agent tab hourly
```

The scheduler's `## scheduled ##` comment marker is stripped before the command runs (see
[[comments]]), so `send`'s parser never sees it.

Alternatively, `schedule NAME in <tab> <form> <cmd>` attaches the timer to the target tab
directly — the entry then lives in (and its schedule window shows in) the target tab rather
than the sender's (see [[scheduling]]).

## Tab-completion

Typing `send <partial>` completes the first argument against every open tab's label (all
tabs, not just agents), via `completeSendTarget` in `src/completion-handlers.ts`.

## Non-goals

- Sending to inline terminal cards (PTYs embedded in an agent's transcript) — only top-level
  tabs are addressable.
- Sending **from** a harness tab — harnesses are pure PTYs with no command parser, so `send`
  can only be run from an agent tab.
- Addressing by tab number (`send 2 ...`) — labels only, consistent with `msg`.
