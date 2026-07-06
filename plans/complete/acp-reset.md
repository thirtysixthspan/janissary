# ACP Conversation Reset

**Complexity: 3/10** — new command wraps the existing `AcpManager.close()` call; no new state, no protocol changes, no persistence.

## Goal

`acp reset` kills the current tab's ACP subprocess and starts fresh on the next prompt, clearing the accumulated context window. Useful when a long session has drifted or the model is confused by prior turns.

The ACP connection already reconnects lazily on the next `/acp <prompt>` — this command just makes the disconnect explicit and user-triggered.

## Design decisions

**Wrap `AcpManager.close()`.** The close method already kills the subprocess and removes the session from the maps. The next prompt will lazily reconnect via `session()`. No new manager method needed.

**New command `acp-reset` with match `acp reset`.** Added before `acp` in the command array so it takes priority. The `acp` command's match (`/^acp\b/i`) would also match `acp reset`, but placement order ensures the more specific matcher runs first.

**Append confirmation to transcript.** When a session was open and is killed: "ACP session reset — next acp prompt will start fresh." When no session was active: "No active ACP session to reset."

## Implementation steps

### 1. Create `src/commands/acp-reset.ts`

New command:
- `name`: `acp-reset`
- `match`: `/^acp\s+reset\b/i`
- `run`: calls `managers.acp.close(tab.label)`, appends success or "no active session" message

### 2. Register in `src/commands/index.ts`

Add import and entry in the `commands` array, placed before `acp`.

### 3. Tests

- `src/commands/acp-reset.test.ts` — test `name`, `match` (matches `acp reset` and `ACP RESET` and `acp  reset`, not `acp resume` or `acp`)
- `src/controller.test.ts` — test `acp reset` closes the session and appends confirmation; test when no session is active

### 4. Update spec

`spec/acp.md` — document the `acp reset` command.

## Out of scope

- No reconnection logic — already handled by lazy connect on next prompt
- No `connection` command changes — `connection close acp` is a separate path

## Verification

`./scripts/run.mjs check-diff` after each step.
