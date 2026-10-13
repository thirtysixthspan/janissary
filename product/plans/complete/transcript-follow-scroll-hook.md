# Transcript Follow-Scroll Hook

**Complexity: 5/10** — this is a localized extraction of one transcript's scroll state and lifecycle plus a small pure policy shared by two scroll surfaces. The existing component and conversation tests already cover the key behavior.

## Goal

Move transcript pinning, resize observation, search-hit positioning, and scroll handling into a dedicated hook, and make both transcript surfaces share the exact programmatic-scroll and bottom-follow threshold rules.

## Approach

Add framework-free `web/src/shared/scroll-follow.ts` predicates for recognizing a scroll position written by pinning and for determining whether a viewport is within the existing bottom threshold. Extract transcript-specific refs, effects, observer cleanup, search positioning, and event handling into `useTranscriptPin`. Keep `Transcript`'s props and markup API intact and have `useStickToBottom` consume the shared policy without changing its active gate or repin key.

## Implementation steps

1. Add the pure shared scroll policy and boundary tests.
2. Extract transcript scroll behavior into `useTranscriptPin` and add focused hook tests for observer teardown and search-hit pin suppression.
3. Update `Transcript` and `useStickToBottom` to use the hook and policy, retaining all existing scroll and rendering tests.
4. Run `./scripts/run.mjs check-diff` after each implementation and test change.
5. Update `product/specs/conversations.md` and `product/specs/transcript.md` to state the shared follow-scroll boundary behavior. Check `help.md` and `documentation/user-documentation/` for existing descriptions that need correction; update neither unless it documents a behavior that changes.

## Tests

- Pure policy tests pin the strict one-pixel programmatic-scroll and forty-pixel follow boundaries.
- Hook tests verify the resize observer disconnects on unmount and a highlighted search result suppresses bottom pinning while scrolling the hit into view with the existing two-line offset.
- Existing transcript pin/rendering tests and conversation streaming/viewport tests continue to pass.

## Out of scope

- Changing either transcript surface's thresholds, strict comparisons, scroll behavior, or public component/hook interfaces.
- Changing terminal rendering, conversation transport, or user-visible controls.
- Updating help or user documentation unless it already describes the changed behavior.
