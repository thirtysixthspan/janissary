# Transcript auto-scroll reaches the end of long output

**Complexity: 3/10** — one ref and two small edits in a single component; no new modules, no protocol or server changes. One new test file.

## Goal

In an agent tab, when a command produces a long output, the transcript should end up scrolled all the way to the last line of that output. Today it scrolls only part of the way and then stops following, leaving the end of the output below the fold.

## Background

Auto-scroll lives entirely in `web/src/transcript/Transcript.tsx`:

- `pin()` (line 34) sets `element.scrollTop = element.scrollHeight` whenever `lines` changes and whenever the content element resizes (`ResizeObserver`, line 45). It is gated on `stick.current`.
- `onScroll` (line 61) recomputes `stick.current` from the viewport's distance to the bottom: `scrollHeight - scrollTop - clientHeight < 40`.

Scroll events are not delivered synchronously — the browser queues them and dispatches them in a later rendering step. During a burst of long output that ordering breaks the stick detector:

1. A chunk arrives, `pin()` writes `scrollTop` to the bottom of the content as it stands. A scroll event is queued.
2. The next chunk arrives and grows the content. `scrollHeight` is now much larger while `scrollTop` still points at the old bottom.
3. The scroll event from step 1 is delivered *now*. `onScroll` measures a distance-to-bottom equal to the freshly added output — far more than 40px — and latches `stick.current` to `false`, even though the user never touched the scrollbar.
4. Every subsequent `pin()` is a no-op. The transcript is frozen partway through the output for the rest of the command.

The detector cannot tell "the user scrolled away from the bottom" from "our own pin, re-measured after the content grew underneath it". The longer the output, the earlier in the burst this fires — which is exactly why the symptom is specific to long output.

## Approach

Record the scroll position auto-scroll has already accounted for, and treat a scroll event that reports that same position as carrying no new information. Only a position the component did not write counts as the user scrolling away, and only that recomputes `stick`.

`pin()` stores the position it wrote; `onScroll` returns early when the reported position still matches it (within a pixel, since browsers may report a fractional `scrollTop`), and otherwise records the new position before recomputing `stick`. Because the stale event in step 3 above reports the position `pin()` wrote, it no longer clears the flag, and the next chunk pins to the new bottom.

Genuine user scrolling is unaffected: a wheel, drag, or keyboard scroll moves `scrollTop` to a position auto-scroll did not write, so `stick` is recomputed as before — cleared when the user scrolls up, restored once they come back within 40px of the bottom. `Escape` (jump to bottom, in `useTranscriptScroll`) keeps working through the same path.

## Implementation steps

1. **Add the accounted-for position ref** — in `web/src/transcript/Transcript.tsx`, add a `lastTop` ref alongside `stick`, initialized to 0, with a comment explaining the asynchronous-scroll-event race it exists to resolve.
2. **Record the pinned position** — in `pin()`, after writing `element.scrollTop`, read the applied value back into `lastTop.current`.
3. **Ignore echo events in `onScroll`** — return early when `Math.abs(element.scrollTop - lastTop.current)` is under 1px; otherwise store the new position in `lastTop.current` and recompute `stick.current` with the existing 40px threshold.
4. **Run `./scripts/run.mjs check-diff`.**

## Tests

New file `web/src/transcript/Transcript.pin.test.tsx` (the existing `Transcript.test.tsx` covers line rendering and is close to the file-size limit), mirroring the metric-stubbing style of `useTranscriptScroll.test.ts` (`Object.defineProperties` for `scrollTop`/`scrollHeight`/`clientHeight`) and the render helpers in `Transcript.test.tsx`:

- Pins to the bottom when new lines arrive.
- **Regression:** after a pin, growing the content and then delivering the stale scroll event does not stop the next batch of lines from pinning to the new bottom.
- A real user scroll away from the bottom stops auto-scroll: later lines do not move the viewport.
- Scrolling back within the 40px threshold resumes auto-scroll on the next lines.
- A content resize reported by the `ResizeObserver` pins to the new bottom.
- `pinToBottom={false}` (the notifications feed) never moves the viewport.

## Out of scope

- Switching the pin effect from `useEffect` to `useLayoutEffect`.
- Observing the viewport element (as opposed to the content element) for resizes — the command bar growing shrinks the viewport, but the browser re-clamps `scrollTop` on its own, so the bottom stays the bottom.
- Virtualizing the transcript for very long buffers.
- The terminal-card (xterm) internal scrollback, which xterm.js manages itself.
- The terminal UI's own `scrollOffset` bookkeeping in `src/tab/`.

## Verification

`./scripts/run.mjs check-diff` must pass clean. Manual: in an agent tab, run a command with several hundred lines of output and confirm the transcript ends at the last line; scroll up mid-command and confirm the view stays where it was put; scroll back to the bottom and confirm it resumes following.
