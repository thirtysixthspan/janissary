# Plan: Send Input to Any Tab (and Schedule It)

## Goal

Add a `send <label> <text>` command that delivers a line of input to **any** named tab, and let it compose with the existing scheduler. The delivery mechanism depends on the target tab's kind:

- **Harness tab** → write the text to the harness PTY as if a human typed it (`text + '\n'`).
- **Agent tab** → dispatch the text as a command line into that tab's command processor (as if typed at its prompt).

Because `send` is an ordinary command, scheduling falls out for free:

```
schedule standup every day at 9am send claude /standup   → types /standup into the claude harness every morning
schedule sweep   every 1h        send worker db vacuum    → runs `db vacuum` in the worker agent tab hourly
send claude /review                                       → one-off, right now
```

Keeping targeting inside a standalone `send` command (rather than teaching `schedule` about tabs) keeps the scheduler's data model unchanged, makes `send` useful on its own, and reuses one delivery path for both interactive and scheduled use.

---

## Background

### Current schedule mechanics

`schedule` stores `ScheduleEntry` objects keyed by the owning tab's label (`ScheduleManager`, `src/schedule-manager.ts`). Each second, `tick()` fires any due entry by calling:

```ts
this.managers.command.dispatchTo(label, `${e.command} ## scheduled ##`);
```

This routes the command **back into the owning tab**. There is no built-in way to target a different tab. The `## scheduled ##` suffix is a comment marker; `dispatchTo` → `recordHistory` runs `stripComments` (`src/tab-manager.ts:218`) **before** the command executes, so the marker is gone by the time `send` parses its arguments — the target never sees it.

### Agent-tab dispatch path

`CommandManager.dispatchTo(label, text)` (`src/command-manager.ts:33`) looks up the tab by label and runs `text` through the normal command pipeline in that tab. This is exactly "type this command into that tab's prompt," and is how `send` delivers to a non-harness agent tab.

Note this differs from `msg`: `msg` delivers a *message* into another agent's inbox via `communication.send`; `send` *runs a command line* in the target tab.

### Harness PTY input path

A harness tab is `view === 'harness'` with a `HarnessView { name, program, ptyId, status }` (`src/types.ts:56,99`). Bytes reach it via:

```
Controller.ptyInput(ptyId, data)  →  PseudoterminalManager.input(ptyId, data)  →  session.write(data)
```

Writing `text + '\n'` delivers the text as one line of human input.

---

## Approach: a `send` command that routes by tab kind

`send <label> <text...>` resolves the target tab by label and delivers `text` according to what kind of tab it is:

| Target tab kind | Delivery |
| --- | --- |
| Harness (`view === 'harness'`, `harness.status === 'running'`) | `ptyInput(harness.ptyId, text + '\n')` — raw keystrokes |
| Agent (`view` undefined/`'agent'`) | `dispatchTo(label, text)` — run as a command in that tab |
| Harness that has exited | error: `Tab "<label>" is not a running harness.` |
| Image / page / markdown view | error: `Tab "<label>" does not accept input.` |
| No such tab | error: `No tab named "<label>".` |

The existing `schedule` system composes with this unchanged — `schedule NAME <timing> send <label> <text>` stores `send <label> <text>` as the entry command, and the scheduler dispatches it into the owning tab, which runs `send` and forwards to the target.

### Syntax

```
send <label> <text...>
```

- `label` — the target tab's label (`claude`, `opencode`, `claude-2`, an agent name, …)
- `text` — the input to deliver as a single line

### Output (in the sender's transcript)

```
→ claude: /standup          (success)
```

Errors are appended to the sender's tab as listed in the routing table above, so a failed send — interactive or scheduled — is always visible.

---

## Files to change

### 1. `src/commands/send.ts` — new file

Parser only; the controller/command owns execution.

```ts
export function parseSendCommand(input: string): { label: string; text: string } | { error: string }
```

- `send` (no args) → `{ error: 'Usage: send <label> <text>' }`
- `send claude` (no text) → `{ error: 'No text to send.' }`
- `send claude /standup` → `{ label: 'claude', text: '/standup' }`

### 2. `src/commands/index.ts`

Register the `send` command alongside the existing list.

### 3. Command handler (`src/commands/send.ts` `run`, using `Managers`)

Resolve the target tab and route by kind:

```ts
const parsed = parseSendCommand(command_);
if ('error' in parsed) { append(parsed.error); return; }
const target = managers.tab.tabs.find((t) => t.label === parsed.label);
if (!target) { append(`No tab named "${parsed.label}".`); return; }

if (target.view === 'harness') {
  if (target.harness?.status !== 'running') { append(`Tab "${parsed.label}" is not a running harness.`); return; }
  managers.pty.input(target.harness.ptyId, `${parsed.text}\n`);
} else if (target.view === undefined || target.view === 'agent') {
  managers.command.dispatchTo(parsed.label, parsed.text);
} else {
  append(`Tab "${parsed.label}" does not accept input.`); return;
}
append(`→ ${parsed.label}: ${parsed.text}`);
```

(`append` = `managers.tab.append(sender.label, { input: command_, output: … })`.) Keep the routing small enough to stay under the cognitive-complexity limit; extract a `deliverTo(target, text)` helper if it grows.

### 4. `src/completion.ts` / `src/completion-handlers.ts`

Add a `completeSendTarget` handler: when the line starts with `send ` and the cursor is on the first argument, complete against all tab labels (prioritizing harness tabs). Wire it in next to `completeAgentName`.

### 5. `src/commands/send.test.ts` — new file

Unit tests for `parseSendCommand` (the four cases above).

### 6. `src/controller.test.ts`

Integration tests:
- Harness target: create a harness tab with a spy PTY, run `send claude /foo`, assert the spy received `/foo\n`.
- Agent target: `send worker state` calls `dispatchTo('worker', 'state')`.
- Scheduled: `schedule s1 every … send claude /foo`, advance the tick past due, assert the spy received `/foo\n` (and no `## scheduled ##`).

### 7. `README.md`

Document the `send` command and its harness-vs-agent behavior.

---

## Non-goals

- Sending to inline terminal cards (PTYs embedded in an agent transcript) — top-level tabs only.
- Sending **from** a harness tab; harnesses are pure PTYs with no command parser.
- Two-way read-back: `send` is fire-and-forget. Harness output stays in its xterm buffer; agent output stays in the target tab's transcript.

---

## Open questions

1. **Newline convention.** `\n` matches the current harness-input assumption; some CLIs may want `\r` (xterm's Enter key). Verify against `claude`/`opencode`/`codex` and centralize the choice in the delivery helper.
2. **Exited harness.** If the target harness has `status: 'exited'`, error (current plan) rather than silently drop — so scheduled sends surface failures.
3. **Label vs. number.** Address by label only (unambiguous, consistent with `msg`), not `send 2`.
