# `send` command

`send <label> <text>` delivers a line of input to a named shell or harness tab. The delivery mechanism depends on the target tab's kind.

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
| Harness (`view === 'harness'`, `harness.status === 'running'`) | the text typed into the PTY as one burst write, followed by a separately delayed carriage return so the harness executes the line (matches xterm's own Enter key). For codex, whose composer otherwise classifies the burst as a paste and suppresses a quick Enter as a newline, the write is framed with bracketed-paste markers (`ESC[200~ … ESC[201~`) so it takes the explicit-paste path and the delayed Enter always submits. |

| Shell tab (plugin tab with an owned terminal) | The text joins the shell tab's FIFO command queue and runs through its command bar: application commands run in the app, and unclaimed lines are submitted to zsh. |
| Harness that has exited | error: `Tab "<label>" is not a running harness.` |
| Plugin without an owned terminal, image / page / markdown view | error: `Tab "<label>" does not accept input.` |
| No such tab | error: `No tab named "<label>".` |

## Output

On success, the sender's transcript records:

```
→ claude: /standup
```

Errors from the routing table above are appended to the **sender's** transcript, so a failed
send — interactive or scheduled — is always visible. `send` is fire-and-forget: there is no
read-back of the target's output into the sender's transcript. Harness output stays in its
own xterm buffer; shell output stays in the target shell’s terminal.

## Composing with `schedule`

`send` is an ordinary command, so `schedule` composes with it unchanged — the scheduler stores
`send <label> <text>` as the entry's command and dispatches it into the *owning* tab (the tab
that ran `schedule`), which runs `send` and forwards to the target:

```
schedule standup every day at 9am send claude /standup   → types /standup into the claude harness every morning
schedule sweep   every 1h        send worker db vacuum    → runs `db vacuum` in the worker shell tab hourly
```

The scheduler's `## scheduled ##` comment marker is stripped before the command runs (see
[[comments]]), so `send`'s parser never sees it.

Alternatively, `schedule NAME in <tab> <form> <cmd>` attaches the timer to the target tab
directly — the entry then lives in (and its schedule window shows in) the target tab rather
than the sender's (see [[scheduling]]).

## Tab-completion

Typing `send <partial>` completes the first argument against every open tab's label (all
tabs, not just agents), via `completeSendTarget` in `src/completion-handlers.ts`. The same
handler backs `queue` and `close`/`exit`'s name argument (see [[tabs]]).

## Non-goals

- Sending to inline terminal cards (PTYs embedded in an agent's transcript) — only top-level
  tabs are addressable.
- Sending **from** a harness tab — harnesses are pure PTYs with no command parser, so `send`
  can only be run from a shell tab.
- Addressing by tab number (`send 2 ...`) — labels only.
