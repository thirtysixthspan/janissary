# Change the queue popup trigger from Cmd+E to Ctrl+E

**Complexity: 1/10** — one modifier swap in an existing chord-key branch, plus test/comment/spec
updates.

## Goal

The agent command queue popup should open with `Ctrl+E` instead of `Cmd+E`.

## Background (verified)

- `web/src/useWindowKeys.ts:98` (`handleChordKeys`) currently has
  `if (e.metaKey && e.key.toLowerCase() === 'e') { e.preventDefault(); cb.openQueue(); return true; }`.
  No existing `ctrlKey && key === 'e'` binding exists elsewhere, so there is no conflict to
  resolve.
- Comments referencing the old binding exist in `web/src/QueuePicker.tsx:3`,
  `web/src/CommandInput.tsx:15`, and `web/src/useQueuePicker.ts:5,15` — all doc comments, no
  user-facing strings, but corrected for accuracy since they directly describe this exact
  keybinding.
- `specs/keyboard-navigation.md:22` and `specs/agent-command-queue.md:33` document `Cmd+E` as the
  trigger — both updated to `Ctrl+E`.
- `help.md` (the file backing the in-app `help` command, per the recent README/help.md split)
  does not currently list the queue keybinding at all — that gap is a separate, already-listed
  small-issue ("the queue command and key bindings need to be added to the help report") and is
  out of scope here.

## Approach

Swap `e.metaKey` to `e.ctrlKey` on the existing branch; update the doc comments and specs that
name the old binding.

## Implementation

1. **`web/src/useWindowKeys.ts:98`** — change
   `if (e.metaKey && e.key.toLowerCase() === 'e') { ... }`
   to
   `if (e.ctrlKey && e.key.toLowerCase() === 'e') { ... }`.
2. **`web/src/useWindowKeys.ts:87`** — update the `handleChordKeys` summary comment
   (`Cmd+E queue` → `Ctrl+E queue`).
3. **`web/src/QueuePicker.tsx:3`**, **`web/src/CommandInput.tsx:15`**,
   **`web/src/useQueuePicker.ts:5,15`** — update `Cmd+E` references to `Ctrl+E` in doc comments.
4. **`specs/keyboard-navigation.md`** and **`specs/agent-command-queue.md`** — update the
   documented trigger from `Cmd+E` to `Ctrl+E`.

## Tests

`web/src/useWindowKeys.test.ts` — renamed `'Cmd+E opens the queue popup'` to
`'Ctrl+E opens the queue popup'`, dispatching `{ ctrlKey: true }` instead of `{ metaKey: true }`.

## Verification

`./scripts/run.mjs check-diff` passes clean. Manual: run the app, press Ctrl+E, confirm the queue
popup opens (and that Cmd+E no longer does). Not runnable in this environment — note as
unverified manually if so.

## Out of scope

- Adding the queue command/keybinding to `help.md` — a separate, already-listed small-issue.
- Any other chord-key bindings (Cmd+F, Cmd+T, Ctrl+R, Ctrl+G) — unchanged.
