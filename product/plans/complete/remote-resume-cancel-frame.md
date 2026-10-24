# Carry auto-resume cancellation across the remote wire

**Complexity: 6/10** — one new server frame threaded through the protocol, decoder, channel router, held-frame buffer, and remote PTY session, with a protocol version bump; every step follows the path `resume-event` already takes.

## Goal

A remote harness whose usage-limit screen clears before the reset has its pending auto-resume withdrawn, the way a local one does. The resume prompt is no longer typed into the harness at the old reset time, and the tab's strip goes back to plain **Auto-resume** as soon as the blockage clears.

## Approach

`HarnessAutoResumer.onCapture` calls its `cancel` callback when a pending limit screen goes away. Locally that cancels the tab's `auto-resume` schedule entry. On the remote host `buildHarnessDetection` passes `cancel: () => {}`, and the client only ever adds the entry, so nothing withdraws it.

Add a `resume-cancel { id }` server frame. The far side's `cancel` sends it. The client routes it through the same channel path as `resume-event`, including the hold that covers an attach in progress, and the remote PTY session answers it with `managers.schedule.cancel(label, RESUME_ENTRY_ID)`. That cancel's existing `removed` hook already sends `resume-ack` and clears the strip flag, so no new acknowledgement is needed. While detached, the far side's replay buffer queues the frame after the `resume-event` it follows, so a reattach schedules and then withdraws the entry in order.

A new frame changes what both ends must understand, so `REMOTE_PROTOCOL_VERSION` moves from 35 to 36: a version-35 peer would refuse the frame as unknown.

## Implementation steps

1. `src/remote/protocol-frames.ts`: declare `{ type: 'resume-cancel'; id: string }` in `ServerFrame` with a comment, and add it to `SERVER_FRAME_TYPES`.
2. `src/remote/frame/decode-detect.ts`: generalize `decodeResumeAck` into `decodeResumeAddressed(type, record)` for both id-only resume frames; route `resume-cancel` and `resume-ack` through it in `src/remote/frame/decode.ts`.
3. `src/remote/protocol.ts`: bump `REMOTE_PROTOCOL_VERSION` to 36 with a changelog paragraph.
4. `src/remote/serve-processes-detect.ts`: have the resumer's `cancel` send `resume-cancel`, and update the doc comment.
5. `src/remote/channel/pending.ts`: admit `resume-cancel` to `PendingFrame`.
6. `src/remote/channel/sessions.ts`: add an optional `onResumeCancel` listener, a `resumeCancel(frame)` method held during an attach exactly as `resumeEvent` is, and its branch in `attach`'s replay.
7. `src/remote/channel/dispatch.ts`: route `resume-cancel` to `router.resumeCancel`.
8. `src/remote/pty-session.ts`: answer `onResumeCancel` with `managers.schedule.cancel(label, RESUME_ENTRY_ID)`.
9. `product/specs/remote-server.md`: describe the withdrawal crossing the wire.

## Tests

- `src/remote/serve-processes.test.ts`: a limit screen followed by a cleared screen sends `resume-cancel` for the spawn id; a cleared screen with nothing pending sends none.
- `src/remote/pty-session.test.ts`: a `resume-cancel` after a `resume-event` cancels the `auto-resume` entry in the tab's schedule.
- `src/remote/protocol.test.ts`: round-trip sample for `resume-cancel`, a malformed case without an id, the admitted server frame list, and the version assertion at 36.
- `src/remote/channel/sessions.test.ts`: `resume-cancel` delivers live, is held during an attach and replayed after the `resume-event` it followed, and is dropped outside the hold.

## Out of scope

- Merging the local and remote detector pipelines so a future observer callback cannot be dropped the same way.
- Any change to how the local resumer schedules or cancels.
