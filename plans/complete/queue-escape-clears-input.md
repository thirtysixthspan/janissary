# Escape on the queue popup also clears the command line

**Complexity: 2/10** — wrap one existing setter in `useQueuePicker.ts`, no protocol/server changes.

## Goal

Pressing Escape while the queue popup is open should close the popup **and** clear whatever text
is currently on the command line — previously it only closed the popup, leaving behind the text
that was copied there when a queue row was selected.

## Background (verified)

- `web/src/keyboard-handlers.ts:42-56` (`handleQueueKey`) already handles `Escape` by calling
  `setQueueOpen(false)` — its own doc comment explicitly says "Escape closes only," confirming the
  text-clearing half was never implemented.
- `web/src/useQueuePicker.ts` — opening the popup (`openQueue`, or arrow-key navigation via
  `selectQueueIndex`) copies the currently-selected queue entry's text into the command line via
  `recallRef.current?.(text)` (`recallRef` is wired to `CommandInput`'s `recall` function, which
  calls `setValue` on the textarea — confirmed at `web/src/CommandInput.tsx:44-48`). Nothing
  cleared that text back out when the popup closed.
- Grepped every call site of the queue picker's exported `setQueueOpen`: the **only** place it is
  ever invoked is `handleQueueKey`'s `Escape` branch, always with `false` — `openQueue` uses the
  hook's internal (unexported) `setQueueOpen(true)` directly. This means the exported setter can
  safely be given "closing also clears the input" behavior without affecting any other caller or
  the popup-opening path.

## Approach

Wrap the internal `setQueueOpen` state setter in a new `closeQueue` function that also clears the
command line (via the existing `recallRef`) whenever it's called with `open === false`, and export
that in place of the raw setter — no changes needed to `handleQueueKey`, `useWindowKeys.ts`, or any
caller, since the exported function's signature (`(open: boolean) => void`) is unchanged.

## Implementation

1. **`web/src/useQueuePicker.ts`** — add, after `openQueue`:
   ```ts
   const closeQueue = useCallback((open: boolean) => {
     setQueueOpen(open);
     if (!open) recallRef.current?.('');
   }, []);
   ```
   and change the returned object's `setQueueOpen` key to `setQueueOpen: closeQueue` (the local
   `setQueueOpen` name — the raw `useState` setter — is unchanged and still used internally by
   `openQueue`).

## Tests

Added to `web/src/App.test.tsx`, `describe('App queue popup', ...)`:

- `'Escape closes the queue popup and clears the command line'` — opens the popup via `queue` +
  Enter (confirming the front entry is copied into the command line, as the existing
  `'selecting the front entry copies it into the command line'` test already does), fires
  `Escape`, and asserts both that the popup's `.picker-title` is gone and the textarea's value is
  now empty.

## Verification

`./scripts/run.mjs check-diff` passes clean. Manual: run the app, queue a couple of commands, open
the queue popup (`Ctrl+E` or `queue`), press Escape, confirm the popup closes and the command line
is empty. Not runnable in this environment — note as unverified manually if so.

## Out of scope

- Any other queue-popup interaction (arrow-key navigation, row click, edit/delete) — unchanged.
- The `Ctrl+E` rebind itself (already done in a prior fix).
