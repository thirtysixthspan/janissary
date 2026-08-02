# Video tab frame capture

**Complexity: 5/10** — one new RPC end to end (wire type, allow-list entry, handler, controller delegation), one small server module that names and writes the file, one client hook plus a button, and the tests, spec, and doc page that go with them. Nothing architecturally new: the write path mirrors `saveFile` and the button mirrors the Split control already in the video tab's header.

A video tab can play a file but you cannot get anything out of it. Wanting a still — a frame to paste into a bug report, a thumbnail, the one moment worth keeping — means leaving the app entirely. The backlog asks for a screenshot button in the video tab that captures the currently playing frame and saves it beside the video under a `.shot-#` name.

## Goal

A **camera button** in the video tab's header writes the frame currently on screen to a PNG beside the video file — `clip.mp4` yields `clip.shot-1.png`, then `clip.shot-2.png`, and so on — and tells you the name it used.

## Design decisions

**The frame is captured on the client, because that is the only place it exists.** The server never decodes the video; it hands bytes to the browser and the browser owns the decoded frame. So the capture is `drawImage` from the `<video>` element onto an offscreen canvas at the video's intrinsic size (`videoWidth` × `videoHeight`, not the on-screen size — a still should be full resolution regardless of how large the tab happens to be), then `toDataURL('image/png')`. The media is served same-origin from `/open/<id>`, so the canvas is not tainted and `toDataURL` does not throw.

**The server owns the filename; the client cannot name the target.** The RPC carries the video tab's own `/open/<id>` ref and the PNG payload — never a path. The server resolves that ref through the open-file allow-list exactly as `saveFile` does (`src/editor/save.ts:13`), then derives the shot path itself from the resolved video's directory and base name. A client that asks to capture can only ever write next to a file the user explicitly opened, under a name the server chose. This is a deliberate, bounded widening of what the client can write — `saveFile` overwrites an already-registered file, whereas this creates a new one — and keeping path construction entirely server-side is what keeps it bounded (architecture principle 9).

**`<base>.shot-<n>.png`, numbered from 1, never overwriting.** `clip.mp4` → `clip.shot-1.png`. The `.png` suffix is not decoration: it makes the result a real image file the OS and the app's own image opener both recognize, so `open clip.shot-1.png` just works. Numbering scans upward from 1 for the first free name, so repeated captures accumulate rather than clobbering each other, and deleting `clip.shot-1.png` means the next capture reuses that number — the same "lowest free" rule `nextFreeName` (`src/editor/next-free-name.ts`) already uses for untitled files, with a different name shape. A separate helper rather than a parameter on `nextFreeName`: that function's contract is "`<base>-2<ext>` after a taken name", and this one always numbers from 1 with a different separator.

**Reject anything that is not a PNG data URL.** The handler accepts only a payload beginning `data:image/png;base64,` and decodes the remainder. This is not defense against the app's own client so much as a guarantee that the one new write path cannot be talked into writing arbitrary bytes chosen by whatever reaches the socket.

**Feedback goes back through the reply, not a transcript.** A video tab has no transcript to note into, and a notification would be heavier than the moment deserves. The RPC replies with the basename it wrote and the header shows it briefly in place of nothing — the same "you did a thing, here is proof" beat as the editor's Saved flash, without persisting anything.

**Capture logic lives in a hook.** `web/src/VideoTab.tsx` is 52 lines; canvas work, the request, the transient confirmation, and its timer would roughly double it and mix two concerns. It goes in `web/src/useVideoShot.ts`, leaving the component to render.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Resolving a `/open/<id>` ref through the allow-list before writing | `src/editor/save.ts:13`–`:15` (`saveFile`) |
| "Lowest free numbered name" logic to mirror, not extend | `src/editor/next-free-name.ts` |
| Synchronous RPC reply pattern | `src/message-handler.ts:49`–`:52` (`complete`) |
| The method allow-list every RPC must join | `src/client-message.ts:3` (`CLIENT_METHODS`) |
| Promise-returning client call | `web/src/ws.ts:109` (`request<T>`) |
| Header action slot and button styling | `web/src/VideoTab.tsx` (`.image-actions`), `web/src/SplitTabButton.tsx` |
| Central icon registry — a camera glyph is added here, not imported ad hoc | `web/src/icons.ts` |
| Video tab spec and user doc to extend | `product/specs/video-tab.md`, `documentation/user-documentation/tab-types/video-player.md` |

## Implementation steps

1. **Server: `src/video-shot.ts`.** Export `nextShotName(dir, videoName)` — strips the video's extension, scans `<base>.shot-<n>.png` from `n = 1` for the first name not on disk — and `saveVideoShot(managers, url, dataUrl): string`, which resolves the ref through `managers.tab.openFilePath`, throws on an unknown ref, throws unless `dataUrl` starts with `data:image/png;base64,`, decodes the remainder into a `Buffer`, writes it, and returns the basename written.

2. **Wire the RPC.** Add `{ method: 'captureVideoFrame'; params: { url: string; dataUrl: string } }` to `RpcCall` in `src/protocol.ts` with a comment explaining that `url` identifies the video tab the way `saveFile`'s does and that the server names the output; add `captureVideoFrame: true` to `CLIENT_METHODS` in `src/client-message.ts`; add a `captureVideoFrame` case in `src/message-handler.ts` that replies `{ t: 'rpc-reply', id, result: { name } }`; add the delegating method to `src/controller.ts`.

2a. **Extract `src/controller/monitor.ts`** (added during implementation, not anticipated when this plan was written). The delegating method in step 2 pushes `src/controller.ts` to 203 lines, three over the limit. Per `ai/guidelines/code-guidelines.md` the only acceptable response is to move a cohesive group out, never to compact what is there. The monitor-reporting block (`runSuggestion`, `rateSuggestion`, `resetMonitorContext`, `monitorContextSnapshot`) is already fenced off behind its own section comment and is the natural candidate: four delegations that belong to one feature. They move to `src/controller/monitor.ts` as plain functions taking `Managers`, exactly the shape `src/controller/file-navigator.ts` already uses, and the controller keeps one-line delegations to them. This is pure extraction — no behavior changes, and the existing monitor tests must pass untouched.

3. **Client: `web/src/useVideoShot.ts`.** A hook taking the video element ref, the payload, and the client. `capture()` no-ops when the element is missing or `videoWidth` is 0 (nothing decoded yet), otherwise draws to a canvas at intrinsic size, calls `request`, stores the returned name in state, and clears it on a timer. Returns `{ capture, saved, busy }`, and clears its timer on unmount.

4. **Client: the button.** Add a camera glyph to `web/src/icons.ts` as `captureFrameIcon`. In `web/src/VideoTab.tsx`, hold a ref on the `<video>`, render a **Capture frame** button in the `.image-actions` slot beside Split, and show the hook's `saved` name in the header while it is set. The button is rendered only when the player is showing — there is no frame to capture in the unplayable state.

5. **Styling.** One rule for the saved-name confirmation in `web/src/theme.css`, beside the existing video rules.

## Tests

- `src/video-shot.test.ts` — `nextShotName` returns `clip.shot-1.png` in an empty directory, skips to `clip.shot-2.png` when the first exists, reuses a gap left by a deleted shot, and strips only the final extension (`my.clip.mp4` → `my.clip.shot-1.png`).
- `src/video-shot.test.ts` — `saveVideoShot` writes the decoded PNG bytes beside the video and returns the basename; throws on an unknown `/open/` ref; throws on a payload that is not a PNG data URL (a JPEG data URL, a bare string, an empty string) **without writing anything**; and writes a second capture to a new name rather than overwriting the first.
- `src/message-handler.test.ts` — `captureVideoFrame` routes through the controller façade and replies with the name.
- The existing monitor tests cover the extracted delegations and must pass **unchanged** — that is the check on step 2a being a pure move.
- `web/src/useVideoShot.test.ts` — captures at the video's intrinsic size rather than its layout size; no-ops when nothing has decoded yet (`videoWidth` 0); sends the payload the canvas produced; exposes the returned name and clears it after the timeout.
- `web/src/VideoTab.test.tsx` — the button renders beside Split while the player is showing and is absent in the unplayable state; clicking it issues the RPC; the returned name appears in the header.

## Out of scope

- **Capturing from a container that only plays externally.** `.mkv` and friends never open a tab, so there is no frame to capture and no button.
- **A `shot` command, keyboard shortcut, or file-navigator action.** The button is the only entry point in this version.
- **Choosing the format, quality, or destination directory.** Always PNG, always beside the video. No config key.
- **Opening the capture after saving**, in the app or an external viewer. It is written and named; opening it is `open clip.shot-1.png`.
- **Capturing a range, a burst, or an animated GIF.** One frame per press.
- **Burning in subtitles or overlays.** The frame is what the decoder produced.
- **Any change to the `/open/<id>` route.** Shots are written, not served; the new file is not registered for serving.
