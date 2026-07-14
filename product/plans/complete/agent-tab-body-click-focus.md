# Agent tab body click focuses the command input

## Problem

The feature "clicking the body of the agent tab should set the input focus on the command line" was partially implemented — `web/src/App.tsx:178` had `onMouseDown={() => inputReference.current?.focus()}`, but in modern browsers the Transcript scroll container (`overflow-y: auto`) can receive focus on click, overriding the programmatic focus call during the same mousedown event. The deferred `setTimeout(0)` ensures the focus call runs after the browser's default mousedown processing completes.

## Complexity

2/10 — defer the existing focus call with `setTimeout(0)` and add a regression test.

## Solution

1. Defer the `inputReference.current?.focus()` call in the `.tab-body` `onMouseDown` handler using `setTimeout(..., 0)` so it runs after the browser's default focus behavior.
2. Add a test verifying the behavior.
3. Remove the stale issue from `plans/small-issues.md`.

## Changes

### `web/src/App.tsx`
- Wrap `inputReference.current?.focus()` in `setTimeout(() => ..., 0)` to defer it past the browser's default mousedown focus handling.

### `web/src/App.test.tsx`
- Add a test: mousedown on the agent tab body (`.tab-body` div) focuses the command input (`<textarea>`), awaiting the deferred focus.

### `plans/small-issues.md`
- Remove the line "clicking the body of the agent tab should set the input focus on the command line".

## Tests

Add to `web/src/App.test.tsx`:
- `mousedown` on the agent tab body `div.tab-body` focuses the command input textarea (await `setTimeout(10)` for the deferred focus to run, then assert `document.activeElement`).

## Spec

No change needed. `specs/tabs.md:67-69` already documents: "pressing anywhere in the body of an agent tab, immediately moves keyboard input focus to that tab's command bar."

## Out of scope
- No changes to the `activeTab`-driven focus effect.
- No changes to text selection behavior in the transcript.
