# Closing UI Window Halts Server

**Complexity:** 2/10

## Goal

When the last browser window/tab is closed (WebSocket disconnects), the server should shut down automatically instead of continuing to run until Ctrl+C.

## Approach

In the WebSocket `close` handler, after removing the client from the set, check whether any clients remain. If none, broadcast `bye` (in case any window is mid-close) and begin the shutdown sequence (same as `requestExit`).

## Implementation

### `src/index.ts`

Replace the single-line close handler with one that checks client count:

```ts
ws.on('close', () => {
  clients.delete(ws);
  if (clients.size === 0) {
    broadcast({ t: 'bye' });
    setTimeout(() => { void close().then(() => process.exit(0)); }, 100);
  }
});
```

When the `quit` command also triggers `requestExit` (which broadcasts `bye`, closes the server, and exits), the WebSocket close handler may fire redundantly during that flow. The duplicate `close()` call is safe (Node.js treats repeated `http.close()` as a no-op), and the duplicate `process.exit(0)` is harmless.

## Tests

No new tests — the existing test suite verifies WebSocket lifecycle and server shutdown. `check-diff` must pass.

## Spec

Update `specs/cli.md` Shutdown sequence to mention that closing the last UI window triggers shutdown.

## Out of scope

- `--no-open` mode (no UI window; user uses Ctrl+C as before).
- Refreshing the browser tab (causes a brief disconnect; the window is immediately reopened, so `clients.size === 0` is never true during the momentary gap).
- Multiple independent windows (each has its own WebSocket; only the last close triggers shutdown).
