# Remove the "help" hint from the notifications tab's empty state

**Complexity: 2/10** — one prop threaded through two components in `web/src/`.

## Goal

The notifications tab currently shows `Type "help" for available commands.` when it has
no notifications yet. That hint is only meaningful for an interactive agent tab (where
typing `help` actually does something); the notifications tab is a read-only feed with
no command bar, so the hint should not appear there.

## Background (verified)

- `web/src/Transcript.tsx:55-57` renders the hint whenever `lines.length === 0`:
  ```tsx
  {lines.length === 0 && (
    <div className="line empty-state">Type "help" for available commands.</div>
  )}
  ```
- `Transcript` is shared by exactly two call sites:
  - `web/src/App.tsx:186` — the normal agent tab, where the hint is correct and must be
    kept.
  - `web/src/NotificationsTab.tsx:45` — the read-only notifications feed, where the hint
    is wrong.
- `NotificationsTab` has no command bar (`noop` handlers for collapse/prompt-click,
  `web/src/NotificationsTab.tsx:18`), confirming the hint doesn't apply there.
- Existing tests for this area: `web/src/NotificationsTab.test.tsx` (render assertions
  using `render`/`screen`/`fireEvent` from `@testing-library/react`). No `Transcript.test.tsx`
  exists yet.

## Approach

Add an optional `showEmptyHint` prop to `Transcript`, defaulting to `true` so `App.tsx`'s
call site is unaffected without changes. `NotificationsTab` passes `showEmptyHint={false}`.

## Implementation

1. **`web/src/Transcript.tsx`**
   - Add `showEmptyHint?: boolean;` to the `Properties` type.
   - Destructure it in the component signature with a default: `showEmptyHint = true`.
   - Guard the hint render: `{showEmptyHint && lines.length === 0 && (...)}`.

2. **`web/src/NotificationsTab.tsx:45`** — pass `showEmptyHint={false}` to `<Transcript>`.

## Tests

Add to `web/src/NotificationsTab.test.tsx`:
- A test asserting that when `lines` is empty, `NotificationsTab` does **not** render the
  `Type "help" for available commands.` text.

No test is needed for `App.tsx`'s call site — its behavior is unchanged (default prop
value), and no existing test currently asserts on that hint text there.

## Verification

Manual: run the web app, open the notifications tab with an empty feed, and confirm no
"Type \"help\"..." hint appears; open a normal agent tab with an empty transcript and
confirm the hint still appears there. Not runnable in this environment — note as
unverified manually.

## Out of scope

- Any other notifications-tab styling issues in `work/issues.md` (metadata line,
  timestamps, colored dot, scrollbar behavior, etc.).
- The empty-state hint's wording or the `help` command itself.
