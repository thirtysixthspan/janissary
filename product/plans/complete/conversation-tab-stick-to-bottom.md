# Pause conversation-tab auto-scroll while the user reviews earlier turns

**Complexity: 3/10** — one component's scroll effect is replaced with a ref-tracked "stick to bottom"
pattern that already exists, verbatim, in `Transcript.tsx`. No new architecture; the change ports a
proven pattern to a second component and extends its existing test file and spec paragraph.

`ConversationTab`'s scroll effect unconditionally sets `scrollTop = scrollHeight` whenever the latest
turn's query, response, error, or streaming flag changes. If a user scrolls up to reread an earlier
turn while a response is streaming, the very next streamed chunk yanks the view back to the bottom —
there is no detection of the user having moved away from the bottom, unlike the sibling `Transcript`
component (used by agent/harness tabs), which already tracks a `stick` ref and only re-pins when the
viewport is within a small threshold of the bottom.

## Approach

Port the `stick`/`lastTop` ref pattern from `web/src/shared/transcript/Transcript.tsx` into
`web/src/plugins/conversations/ConversationTab.tsx`:

- A `stick` ref, initialized `true`, gates whether the pin effect is allowed to move `scrollTop`.
- A `lastTop` ref records the last scroll position the pin effect itself wrote, so the async `scroll`
  event fired by a pin isn't misread as the user moving away (the same race `Transcript` already
  guards against).
- The existing pin effect becomes a `pin()` callback that only writes `scrollTop` when `stick.current`
  is true, matching `Transcript.pin`'s shape.
- The existing `onScroll` handler (currently only used to trigger `load-older` at `scrollTop === 0`)
  gains the same recompute `Transcript.onScroll` does: skip if the position matches `lastTop` (no real
  user movement), otherwise update `lastTop` and set
  `stick.current = scrollHeight - scrollTop - clientHeight < 40`. The `load-older` check stays as its
  own condition in the same handler.

This keeps the "preserve viewport when older turns are prepended" behavior intact: that case doesn't
touch the latest turn's query/response/error/streaming fields, so the pin effect's dependency array
still doesn't fire for it — nothing about that path changes.

## Implementation steps

1. `web/src/plugins/conversations/ConversationTab.tsx` — add `stick` and `lastTop` refs; replace the
   unconditional scroll-to-bottom effect with a `pin()` callback gated on `stick.current`, called from
   a `useEffect` with the same dependency array as today; extend the `onScroll` handler to recompute
   `stick`/`lastTop` before its existing `load-older` check.

## Tests

Extend `web/src/plugins/conversations/ConversationTab.test.tsx`, mirroring
`web/src/shared/transcript/Transcript.pin.test.tsx`'s equivalent cases:

- Stops following once the user scrolls away from the bottom while a response streams in: after a
  simulated scroll away (via `fireEvent.scroll` with a `scrollTop` far from the bottom), a further
  streamed update does not move `scrollTop`.
- Resumes following once the user scrolls back within the threshold of the bottom: after scrolling
  back near the bottom, a further streamed update moves `scrollTop` to the new `scrollHeight`.

## Out of scope

- Any change to `Transcript.tsx` itself — it already has this behavior and is the reference.
- The `ResizeObserver`-triggered re-pin `Transcript` uses for reflow without new lines. Conversation
  turns are plain block elements appended at the end, not reflowing markdown that changes height
  independent of new content, so `Transcript`'s extra observer isn't needed here.
- The `highlight`/search-scroll behavior `Transcript` has; conversation tabs have no search feature.
- Any change to the `load-older` trigger threshold or behavior.

## Verification

Automated: `./scripts/run.mjs check-diff` after the change and after the new tests.
