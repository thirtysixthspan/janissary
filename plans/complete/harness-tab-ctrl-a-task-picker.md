# Let Ctrl+A open the task picker from a harness tab

**Complexity: 2/10** — one-line change to an existing key filter, plus a matching test; fully isolated.

## Goal

Pressing Ctrl+A while a harness tab's terminal has focus opens the task picker, matching the
behavior everywhere else in the app. Today the harness terminal (xterm) swallows Ctrl+A and sends
it to the PTY before it ever reaches the window-level key handler that owns the Ctrl+A → task
picker chord.

## Design decision

**Fix `harnessKeyFilter` only — leave `ShellTab` and `TerminalCard` alone.** The issue names harness
tabs specifically. `web/src/useWindowKeys.ts`'s `ctrlChordOpener` already wires Ctrl+A globally to
`openTaskPicker`; the problem is purely that `web/src/HarnessTab.tsx`'s `harnessKeyFilter`
(`web/src/HarnessTab.tsx:10-14`) only lets `Shift+ArrowLeft/Right` bubble, so Ctrl+A never leaves
the terminal.

`ShellTab.tsx`'s `shellKeyFilter` has identical logic and the same gap, but its own comment
(`web/src/ShellTab.tsx:8-9`) explains that's deliberate — shell tabs are real interactive shells
where Ctrl+C/D/Z/etc. (and by the same logic, Ctrl+A "move to line start") must reach the program
running inside, not the app chrome. Changing it is out of scope for this issue and would conflict
with that stated intent.

`TerminalCard.tsx`'s `cardKeyFilter` already bubbles Ctrl+A (it bubbles every Ctrl/Shift combo), so
it has no bug to fix.

**Only add the Ctrl+A exception, not a blanket Ctrl bubble.** Widening `harnessKeyFilter` to bubble
all Ctrl chords (like `cardKeyFilter` does) would also stop Ctrl+C, Ctrl+R, etc. from reaching the
harness process, which is a live AI agent CLI that relies on those keys (e.g. interrupt). Add the
narrowest possible condition: bubble when it's a plain Ctrl+A (no Shift/Alt/Meta), same shape as the
existing `isTabSwitch` check.

## Implementation

1. **`web/src/HarnessTab.tsx`** — extend `harnessKeyFilter` with a second bubble condition:
   ```ts
   function harnessKeyFilter(e: KeyboardEvent): boolean {
     if (e.type !== 'keydown') return true;
     const isTabSwitch = e.shiftKey && !e.ctrlKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight');
     const isTaskPicker = e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'a';
     return !(isTabSwitch || isTaskPicker);
   }
   ```
   Update the file's leading comment (`web/src/HarnessTab.tsx:16-17`) to mention both bubble cases.

## Tests

- **`web/src/HarnessTab.test.tsx`** — add a case: `capturedKeyHandler!(makeKeyEvent({ ctrlKey: true, key: 'a' }))` returns `false` (bubble). Add a case confirming `Ctrl+Shift+A` still returns `true` (sent to PTY), to pin the narrow scope of the fix.

## Verification

- `./scripts/run.mjs check-diff` — lint, incremental typecheck, and the related web tests.
- Manual (not run in this environment): open a harness tab, click into its terminal to focus it,
  press Ctrl+A — confirm the task picker opens instead of the keystroke reaching the agent CLI.

## Out of scope

- `ShellTab.tsx` / `TerminalCard.tsx` — no change; see design decision above.
- Any other Ctrl chord's bubble behavior in harness tabs.
