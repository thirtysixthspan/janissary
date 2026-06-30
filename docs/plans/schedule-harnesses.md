# Plan: Schedule Input into Harness Tabs

## Goal

Allow an agent tab to schedule a command that delivers text input to a named harness tab's PTY — for example, to send a prompt to a running Claude Code session every morning.

---

## Background

### Current schedule mechanics

`schedule` stores `ScheduleEntry` objects on a tab (`Controller.schedules`, keyed by the owning tab's label). Each second `tick()` fires any due entries by calling `dispatchTo(tab.label, entry.command)`, which routes the command **back into the same tab** that owns the schedule. There is no mechanism to target a different tab, and specifically no path to write bytes to a harness PTY.

### Harness PTY input path

A harness tab holds a `HarnessView` with a `ptyId`. Bytes reach it via:

```
Controller.ptyInput(ptyId, data)
  → PtySession.write(data)
    → node-pty proc.write(data)
```

`ptyId` is keyed in `Controller.ptys: Map<string, { session: PtySession; tabLabel: string }>`. The harness tab label is the natural human-readable key (e.g. `claude`, `claude-2`).

---

## Approach: new `send` command

Add a `send <harness-label> <text>` command that writes `text + '\n'` to the named harness tab's PTY. The existing `schedule` system then composes naturally:

```
schedule standup every day at 9am send claude /standup
```

This keeps the schedule data model unchanged, requires no parser changes, and adds a command useful on its own outside schedules.

### Syntax

```
send <label> <text...>
```

- `label` — the harness tab's label (e.g. `claude`, `opencode`, `claude-2`)
- `text` — the text to deliver as a single line of input

### Success output (shown in the sender's transcript)

```
→ claude: /standup
```

### Error cases

- Tab not found: `No harness tab named "<label>".`
- Tab exists but is not a harness (or has no running PTY): `Tab "<label>" is not a running harness.`

---

## Files to change

### 1. `src/commands/send.ts` — new file

Parser only — `parseSendCommand` is the public surface; the controller owns execution.

```ts
export function parseSendCommand(input: string): { label: string; text: string } | { error: string }
```

### 2. `src/commands/index.ts`

Import and register the `send` command alongside the existing list.

### 3. `src/controller.ts`

Add a `case 'send':` branch in `runApp`:

```ts
case 'send': {
  const parsed = parseSendCommand(command);
  if ('error' in parsed) { this.append(label, { input: command, output: parsed.error }); return; }
  const target = this.tabs.find((t) => t.label === parsed.label && t.view === 'harness');
  if (!target?.harness || target.harness.status !== 'running') {
    this.append(label, { input: command, output: `Tab "${parsed.label}" is not a running harness.` });
    return;
  }
  this.ptyInput(target.harness.ptyId, `${parsed.text}\n`);
  this.append(label, { input: command, output: `→ ${parsed.label}: ${parsed.text}` });
  return;
}
```

### 4. `src/completion.ts`

When the command line starts with `send ` and the cursor is on the first argument, complete against labels of tabs where `tab.view === 'harness'`. Wire this into `completeCommandLine` alongside the existing `msg`/`broadcast` agent-name completion.

### 5. `src/commands/send.test.ts` — new file

Unit tests for `parseSendCommand`:

- `send claude /standup` → `{ label: 'claude', text: '/standup' }`
- `send claude-2 hello world` → `{ label: 'claude-2', text: 'hello world' }`
- `send` (no args) → `{ error: 'Usage: send <harness> <text>' }`
- `send claude` (no text) → `{ error: 'No text to send.' }`

### 6. `src/controller.test.ts`

Integration test: create a harness tab with a spy PTY, schedule `send claude /foo`, advance the tick past due time, assert the spy received `/foo\n`.

---

## Non-goals

- Sending input to inline terminal cards (PTYs embedded in an agent tab's transcript) — harness tabs only for now.
- Scheduling commands **from** a harness tab; harnesses are pure PTY and have no command parser.
- A two-way read-back: `send` is fire-and-forget. The harness output remains in the harness tab's xterm buffer.

---

## Open questions

1. **Label vs. number:** should `send 2` target harness tab number 2, or only label-based addressing? Label-based is unambiguous and consistent with `msg`.
2. **No running PTY:** if the harness tab exists but has `status: 'exited'`, should we silently drop the message or error? Current plan is to error so scheduled sends surface failures visibly.
