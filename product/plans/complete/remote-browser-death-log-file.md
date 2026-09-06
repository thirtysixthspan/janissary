# Carry a remote browser's full output across the channel and log it locally

**Complexity: 4/10** — the local half already exists (`src/browser/browser-log.ts`, `writeBrowserLog`, and the notification's `openFile` link). What is missing is one optional field on one existing frame, and the version bump the contract's own rules require for it. No new frame type, no new module, no change to how the log is written or opened.

## Goal

A `-b` tab launched `on <host>` runs its browser on the far side, and only that host sees what the browser said on its way out. The `browser-exited` frame already carries the composed message — the report plus the bounded tail — so a remote browser's death reads the same as a local one in the notifications feed and in the band above the tab.

What it does not carry is the full output. The log file and its click-to-open link are therefore local-only: a remote Chromium segfault still loses the frames naming where it faulted, which is exactly the gap the log file was built to close. Carry the full text on the frame and write it on this side, so a remote death produces the same file and the same link as a local one.

## Approach

The frame is the only seam. `stopSession` on the remote host already hands `onBrowserGone` both halves — the bounded `message` and the complete `log` — and `RemoteProcesses.spawnPty` currently forwards only the first. Widening the frame to carry both, and having `RemoteManager.notifyBrowserGone` write the second through the existing `writeBrowserLog`, makes the remote path identical to the local one from the notification's point of view.

The file is written **on this side**, not the remote's. The remote host has no notifications tab and no editor tab; the link has to resolve against the filesystem the user's janissary is reading. So the text crosses the channel and lands in this project's own `.janissary/browser-logs/`, named for the local tab, exactly as a local browser's would be — which also means it is swept by the same startup clear and needs no cleanup on the far side.

**The version moves to 13.** `REMOTE_PROTOCOL_VERSION` is checked for strict equality at the handshake, and the contract's stated rule is that it covers what frames *carry*, not only their shape: a field one end fills in and the other is expected to honor is as much a part of the contract as a new frame type. `log` is such a field — a version-12 remote paired with a newer local side would report every browser death with no log and no link, looking healthy while quietly withholding the thing this exists to deliver. That is the case the check exists for, so it is refused at the handshake instead.

**No second size bound.** The retained capture is already bounded at 100k characters, and the frame codec is newline-delimited JSON, where `JSON.stringify` escapes the log's newlines so a multi-line trace cannot be read as the end of a frame — the same property the existing `message` field already relies on. Giving the remote path a tighter bound of its own would make the two paths disagree about what "the browser's full output" means, which is the confusion this fix is meant to remove.

## Implementation steps

1. `src/remote/protocol.ts`: add `log?: string` to the `browser-exited` frame, bump `REMOTE_PROTOCOL_VERSION` to 13, and add the version-13 paragraph to the running commentary above it, in the same form as versions 6 through 12.
2. `src/remote/frame-decode.ts`: `decodeBrowserExited` validates `log` with the existing `optionalNonEmptyString` and includes it only when present, alongside `message`. With two optional fields the current nested ternary stops reading well — build the frame once with conditional spreads.
3. `src/remote/serve-processes.ts`: `onBrowserGone` takes both arguments and puts `log` on the frame when there is one.
4. `src/remote/manager.ts`: `notifyBrowserGone` takes the log, writes it through `writeBrowserLog(tab.label, Date.now(), log)`, and passes the returned path to `notify` as its `openFile`. Unchanged otherwise: the band on the tab still carries the message alone, and a frame with no log notifies with no link.

## Tests

- `src/remote/frame-decode.test.ts`: a `browser-exited` frame carrying `log` decodes with it; one without decodes as before; an empty-string `log` is refused as malformed; a multi-line log survives a round trip through `encodeFrame`/decode.
- `src/remote/serve-processes-browser.test.ts`: the frame carries the log the browser's death handed it; a death with no log sends a frame with no `log` field.
- `src/remote/manager.test.ts`: a frame carrying a log writes it and links it from the notification; a frame without one notifies with no link; a write that fails still notifies; the log is written against the tab that owns the session rather than the channel label.
- `src/remote/protocol.test.ts`: no change needed — its handshake assertions read `REMOTE_PROTOCOL_VERSION` rather than a literal.

## Spec updates

- `product/specs/remote-server.md` — extend the browser paragraph to say the frame now carries the browser's complete output as well as the composed message, that the local side writes it to its own log directory and links it from the notification line, and why the file is written on this side. Add the version-13 note in the running list, and extend the frame-validation paragraph to cover `log` (optional, nonempty when present, newlines JSON-escaped like `message`).
- `product/specs/harness.md` — one sentence in the gone-browser section noting that a remote `-b` tab's browser produces the same log file and link, written on the local host from what the remote sent.

## Docs

- `documentation/user-documentation/advanced-agents/harness.md` documents the browser-death report and now the log file. Check whether its remote-browser text distinguishes the two paths; if it does, correct it in place so it does not imply the log is local-only. No new documentation otherwise.

## Out of scope

- The bounded tail, the log's contents, its filename, its directory, and the startup sweep — all unchanged and shared with the local path.
- The band above the tab's terminal, which keeps carrying the message alone on both paths.
- Writing anything on the remote host, or reading the remote's own filesystem to fetch the log after the fact.
- Every other frame in the contract.
