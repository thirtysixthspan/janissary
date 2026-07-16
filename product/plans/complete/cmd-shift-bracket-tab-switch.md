# Wire up Cmd+Shift+[ / Cmd+Shift+] as an alias for tab switching

**Complexity: 4/10** — a small, well-contained key-binding addition, but it touches four source
files (the window-level handler plus two PTY-tab key filters that must let the new chord bubble
through) and three documentation surfaces (spec, public docs, in-app `help`).

## Goal

`Cmd+Shift+[` / `Cmd+Shift+]` switch to the previous/next tab, exactly like the existing
`Shift+←` / `Shift+→` — a second, macOS-idiomatic binding for the same action (matches Safari,
Xcode, iTerm2, VS Code's tab-switch convention), not a replacement. Works everywhere `Shift+←/→`
already works, including bubbling through harness/shell full-tab terminals instead of being sent
to the PTY.

## Background

- **Where tab switching is dispatched**: `handleTabShortcuts` in `web/src/useWindowKeys.ts:113-119`
  matches `Shift+←/→` and sends the `moveTab` RPC (`{ dir: -1 | 1 }`). `Ctrl+←/→` is a different
  RPC (`reorderTab`, moves the tab's position) — not to be confused.
- **Why PTY tabs need their own change**: a harness or shell full-tab terminal sends every
  keystroke to the PTY by default; `Shift+←/→` is special-cased to bubble up to the window
  handler instead. `web/src/ShellTab.tsx`'s `shellKeyFilter` (`:11-15`) and
  `web/src/HarnessTab.tsx`'s `harnessKeyFilter` (`:14-20`) each hardcode that one check. The new
  chord needs the same carve-out in both, or a harness/shell tab would swallow it.
- **`web/src/TerminalCard.tsx`'s `cardKeyFilter`** (inline PTY card, not a full-tab terminal)
  bubbles on `e.shiftKey || e.ctrlKey` unconditionally (`:10-13`) — already permissive enough to
  let `Cmd+Shift+[/]` through (shiftKey is true regardless of metaKey), so it needs no change.
- **Key value with Shift held**: on a US layout, holding Shift while pressing the physical `[`/`]`
  key produces `e.key === '{'` / `'}'`, not `'['`/`']'`. Checking must accept both the shifted and
  unshifted `key` value so the binding isn't layout-fragile in the common case.

## Implementation steps

1. **`web/src/useWindowKeys.ts`** — extend `handleTabShortcuts` with the new chord, calling the
   same `moveTab` RPC as `Shift+←/→`:
   ```ts
   function handleTabShortcuts(e: KeyboardEvent, client: JanusClient): void {
     if (e.ctrlKey && !e.shiftKey && e.key === 'ArrowLeft') { e.preventDefault(); client.send({ method: 'reorderTab', params: { dir: -1 } }); }
     else if (e.ctrlKey && !e.shiftKey && e.key === 'ArrowRight') { e.preventDefault(); client.send({ method: 'reorderTab', params: { dir: 1 } }); }
     else if (e.shiftKey && !e.ctrlKey && e.key === 'ArrowLeft') { e.preventDefault(); client.send({ method: 'moveTab', params: { dir: -1 } }); }
     else if (e.shiftKey && !e.ctrlKey && e.key === 'ArrowRight') { e.preventDefault(); client.send({ method: 'moveTab', params: { dir: 1 } }); }
     else if (e.metaKey && e.shiftKey && (e.key === '[' || e.key === '{')) { e.preventDefault(); client.send({ method: 'moveTab', params: { dir: -1 } }); }
     else if (e.metaKey && e.shiftKey && (e.key === ']' || e.key === '}')) { e.preventDefault(); client.send({ method: 'moveTab', params: { dir: 1 } }); }
     else if (e.ctrlKey && e.key.toLowerCase() === 't') { e.preventDefault(); client.send({ method: 'toggleCollapse', params: {} }); }
   }
   ```
2. **`web/src/ShellTab.tsx`** — extend `shellKeyFilter` to also bubble the new chord:
   ```ts
   function shellKeyFilter(e: KeyboardEvent): boolean {
     if (e.type !== 'keydown') return true;
     const isTabSwitch = (e.shiftKey && !e.ctrlKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight'))
       || (e.metaKey && e.shiftKey && (e.key === '[' || e.key === '{' || e.key === ']' || e.key === '}'));
     return !isTabSwitch;
   }
   ```
   Update the file's leading comment ("Only Shift+←/→ ... bubbles") to mention both chords.
3. **`web/src/HarnessTab.tsx`** — same change to `harnessKeyFilter`'s `isTabSwitch` check, and
   update its comment (`:22-25`) the same way.

## Tests

- **`web/src/useWindowKeys.test.ts`** — add cases (mirroring the existing "does nothing when
  state is null" pattern at `:266-277`, which builds its own `client`/`stateRef` to assert on
  `client.send`) verifying `Cmd+Shift+[` sends `moveTab` with `dir: -1` and `Cmd+Shift+]` sends
  `moveTab` with `dir: 1`, plus one case for the shifted-character form (`key: '{'`/`'}'`).
- **`web/src/ShellTab.test.tsx`** — extend the existing filter-behavior tests (`:45-47` pattern)
  with cases asserting the filter returns `false` (bubble) for `Cmd+Shift+[`/`Cmd+Shift+]` (and
  their `{`/`}` forms), and still returns `true` (send to PTY) for `Cmd+[` / `Cmd+]` without
  Shift (back/forward is a different, unrelated chord elsewhere — this filter has no opinion on
  it, so plain `Cmd+[`/`Cmd+]` must still reach the PTY unless some other rule already stops it).
- **`web/src/HarnessTab.test.tsx`** — mirror the same cases against `harnessKeyFilter`, alongside
  the existing "returns false (bubble) for Shift+ArrowLeft" test (`:84-87`).

## Documentation updates

- **`product/specs/keyboard-navigation.md`** — update the `Shift+←` / `Shift+→` row(s) to note
  `Cmd+Shift+[` / `Cmd+Shift+]` as an alias for the same action.
- **`documentation/user-documentation/getting-started/keyboard.md`** — update rows `:11-12` the
  same way, and extend the harness-tab carve-out sentence at `:32` to mention the new chord
  alongside `Shift+←`/`Shift+→`/`Shift+Tab`.
- **`help.md`** (backs the in-app `help` command, `src/commands.ts`) — update the
  `Shift+←` / `Shift+→` row at `:46` the same way.

## Out of scope

- `Ctrl+←/→` (`reorderTab`, moves a tab's position) — unrelated to this issue, not touched.
- `Cmd+[` / `Cmd+]` (no Shift) — conventionally back/forward navigation in other apps; janus has
  no such navigation concept today, so plain `Cmd+[`/`Cmd+]` is left unbound, not repurposed.
- `web/src/TerminalCard.tsx` — already permissive enough (see Background); no change needed.

## Verification

- `./scripts/run.mjs check-diff` — lints changed files, incrementally typechecks, runs the
  affected web tests.
- Manual: not practical to drive real keyboard events against the built app in this environment;
  covered by the unit tests above instead.
