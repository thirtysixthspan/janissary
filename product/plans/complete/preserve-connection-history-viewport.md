# Preserve the Connection History Viewport Across Streamed Updates

**Complexity: 2/10** — a ref key and effect guard change in one hook, plus one focused hook test and one spec sentence.

## Goal

Keep a reader's place when they request older connection history and streamed activity grows the newest block before the older window arrives.

## Approach

The hook currently treats every content-key change as proof that older blocks arrived: it applies the saved scroll-height delta and clears the pending restoration. `ConnectionTab` includes the latest activity text in that key, so a streamed update consumes the restoration before the window offset changes.

Key the pending restoration on the window offset instead. Record the offset and height when a top-page request starts. On a later effect, apply the height delta only when `offset` differs from the recorded offset. At the same offset, refresh the recorded height so the eventual delta covers only the prepended window, then continue to the existing active-view and follow-threshold behavior without clearing the restoration. Keep the rejection handler's clearing of both refs and leave the 40px threshold and the server's window size unchanged.

## Implementation steps

1. Change the restoration ref to hold the requested offset in place of the content key.
2. Record that offset in `requestOlder`, and compare it in the effect before applying the height delta; at the same offset, refresh the baseline and fall through to follow handling.
3. Add the streamed-growth-before-older-window case to the hook tests and retain every existing case.
4. State in `product/specs/connections-tab.md` that streamed activity while older history is loading does not move the reader's place.
5. Run `./scripts/run.mjs check-diff` after the hook, test, and spec changes.

## Tests

- Request older blocks at the top, grow the latest activity text while the offset is unchanged, then arrive at the older window: the viewport lands at the prepended height and not at the bottom.
- Existing streamed-follow, inactive-view, page-deduplication, rejection-retry, and scroll-restoration cases continue to pass.

## Out of scope

- Changing the 40px bottom-follow threshold, the active-view gate, or the server's 20-block window size.
- Changing connection history rendering, paging transport, or other scroll surfaces.
- Updating help or user documentation, which does not describe this loading-window detail.
