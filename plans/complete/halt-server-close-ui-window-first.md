# Halt Server Should Close UI Window First

**Complexity:** 2/10

## Goal

When the server is halted (Ctrl+C, SIGINT, SIGTERM), the UI window should receive a close signal before the server shuts down. Currently `server.close()` is called directly, which tears down the HTTP server and WebSocket without giving the browser window a chance to close cleanly.

## Approach

Add a `shutdown()` method to `RunningServer` that broadcasts a `bye` event (telling browser windows to close), waits 100ms for them to close, then calls the existing `close()` sequence. Change `main.ts`'s signal handler to call `shutdown()` instead of `close()`.

## Implementation

### 1. `src/index.ts` — add `shutdown` to `RunningServer`

```ts
export type RunningServer = { url: string; port: number; token: string; close: () => Promise<void>; shutdown: () => void };
```

In the return value:
```ts
return { url, port, token, close, shutdown: () => requestExit() };
```

Since `requestExit` already does exactly what we need (broadcast `bye`, wait, close, exit), we just expose it.

### 2. `src/main.ts` — use `server.shutdown()` for signals

```ts
const stop = () => { server.shutdown(); };
```

This replaces the current `server.close().then(() => process.exit(0))`.

## Tests

No new tests — signal handling is exercised by existing shutdown flow tests. `check-diff` must pass.

## Spec

Update `specs/cli.md` to describe the shutdown sequence: signal → broadcast bye → wait → close server → exit.

## Out of scope

- The `quit` command path (already uses `requestExit` via `messageBus` → `exit` sink).
- `--relaunch` state preservation (the UI window closing is purely a visual/cleanup step; state is preserved independently).
