# Agent tab body click focuses the command input

## Problem

The feature "clicking the body of the agent tab should set the input focus on the command line" is already implemented in `web/src/App.tsx:178` (`onMouseDown={() => inputReference.current?.focus()}` on the `.tab-body` div). The spec at `specs/tabs.md:67-69` also already documents this behavior. However, there is no test verifying the behavior, and the issue entry remains in `plans/small-issues.md` as a stale item.

## Complexity

1/10 — add a test for existing behavior; no code changes needed.

## Solution

Add a test in `web/src/App.test.tsx` that verifies mousedown on the agent tab body focuses the command input textarea. This confirms the behavior works and prevents regression. Remove the stale issue line from `plans/small-issues.md`.

## Changes

### `web/src/App.test.tsx`
- Add a test: mousedown on the agent tab body (`.tab-body` div) focuses the command input (`<textarea>`).

### `plans/small-issues.md`
- Remove the line "clicking the body of the agent tab should set the input focus on the command line".

## Tests

Add to `web/src/App.test.tsx`:
- `mousedown` on the agent tab body `div.tab-body` focuses the command input textarea (use `fireEvent.mouseDown` from `@testing-library/react`).

## Spec

No change needed. `specs/tabs.md:67-69` already documents: "pressing anywhere in the body of an agent tab, immediately moves keyboard input focus to that tab's command bar."

## Out of scope
- No changes to `web/src/App.tsx` (the behavior is already correct).
- No changes to the `activeTab`-driven focus effect.
