# Cover the relayed detached capture query

Complexity 5/10 - test-only, no source changes. The module itself is small (55 lines), but
covering it well needs a temporary unix socket, a couple of hand-built peers (not always the
real `DetachedPeer`, since one case needs to control write timing `DetachedPeer` does not
expose), and fake timers combined with a real socket lifecycle — a pattern this codebase
already uses elsewhere (`src/harness/manager.test.ts`), but it takes care to get right.

`src/remote/serve-detach-query.ts` — `requestParkedCapture`'s socket connection to a parked
peer, newline framing across chunk boundaries, its ten-second deadline, reply correlation, and
its four failure exits — plus `answerCaptureRequest`, is referenced by no test in the tree.

## Goal

A new `src/remote/serve-detach-query.test.ts`, colocated beside the module, covering both
exported functions with real sockets rather than a `node:net` mock, per the entry's own
instruction.

## Approach

`requestParkedCapture(root, session, id, request)` reads `<root>/.janissary/remote/<session>.json`
for `{ socket }`, connects to it, sends one `capture-request`, and resolves with the reply's
`{ text, capturedAt }` or `undefined` on any failure (missing/bad record, wrong id/request,
timeout, or a decode/connect error). Two ways to test the connected-peer cases:

- For the case that only needs a peer that answers correctly, use a real `DetachedPeer` from
  `./serve-detach.js` — `new DetachedPeer(tmpRoot, session, vi.fn(), vi.fn(), getCapture)`,
  `await peer.start(vi.fn())`, `peer.detach()` — exactly the `detached peer rendezvous` suite's
  shape in `serve.test.ts`. `DetachedPeer.start()` only needs a writable `root` for its record
  file and a scratch directory for its socket; it does not need a git repo, so a bare
  `mkdtempSync` directory is enough here (lighter than `serve.test.ts`'s `beforeAll`).
- For the split-write case, `DetachedPeer.accept()` answers with one `socket.end(...)` call, so
  it cannot be used to control write timing. Stand up a real `node:net` server by hand for that
  one case (using `node:net` for real, not `vi.mock`), writing the reply frame in two
  `socket.write()` calls with a queued-microtask or short real gap between them, and point a
  hand-written record file's `socket` field at it.
- For "peer that never answers", the same hand-built `node:net` server, accepting the
  connection but never writing anything. `socket.setTimeout` runs through libuv rather than the
  global `setTimeout` fake timers patch (confirmed by running it under `vi.useFakeTimers()` —
  the test hung), so this case waits out the real ten seconds with an extended per-test timeout
  rather than advancing a fake clock.

`answerCaptureRequest(frame, processes, root, emit)` needs no sockets at all: a fake
`processes` object for the direct branch, and `processes: undefined` with a real
`requestParkedCapture` round trip (via a real `DetachedPeer`, as above) for the no-workspace
branch.

## Implementation steps

1. Create `src/remote/serve-detach-query.test.ts` with a `beforeEach`/`afterEach` pair that
   makes and removes a `mkdtempSync` root directory.
2. Write the `requestParkedCapture` cases listed under Tests below, in order from simplest
   (no record file) to most involved (split write, timeout).
3. Write the `answerCaptureRequest` cases.
4. Run `check-diff`, then run this file directly with `npx vitest run
   src/remote/serve-detach-query.test.ts` to confirm no flake from real socket timing before
   relying on `check-diff`'s single pass.

## Tests

All new, in `src/remote/serve-detach-query.test.ts`:

- `requestParkedCapture`:
  - resolves `{ text, capturedAt }` from a real, live parked peer's reply.
  - resolves the same when the reply arrives split across two socket writes.
  - resolves `undefined`, without throwing, when the record file does not exist.
  - resolves `undefined`, without throwing, when the record file exists but is not valid JSON.
  - resolves `undefined` when the record's `socket` field is not a string.
  - resolves `undefined` once the ten-second timeout fires, for a peer that accepts the
    connection but never replies (a real wait, under an extended per-test timeout).
  - resolves `undefined` for a reply naming a different `id`, and separately for one naming a
    different `request`.
- `answerCaptureRequest`:
  - with a live `processes`, emits one `capture-reply` carrying `processes.latestCapture(id)`'s
    text and timestamp.
  - with a live `processes` but nothing captured for `id`, emits a `capture-reply` with no
    `text`/`capturedAt` fields.
  - with `processes: undefined`, delegates to `requestParkedCapture` and emits its result as a
    `capture-reply`.

The existing `serve.test.ts` cases proving a capture query leaves the peer attachable
afterward (`answers a capture-request directly, without attaching, claiming the socket, or
ending the peer's ability to be attached afterward`, and the two beside it) are untouched —
they pin the property this new file's `DetachedPeer`-based cases share.

## Out of scope

- No changes to `serve-detach-query.ts`, `serve-detach.ts`, or `serve.ts` — this is coverage
  only, exactly as the entry names it.
- No new flakiness-avoidance refactor of existing tests elsewhere in the file.
