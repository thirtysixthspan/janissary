# Command bar ghost text

**Complexity: 3/10** — entirely client-side in one component, but correctness depends on the CSS mirror-overlay alignment (shared font rule, paint-order via `position: relative`), the caret-position gate on acceptance, and the `preventDefault`-only-on-accept discipline in the key switch.

## Goal

As the user types in the command bar, the most recent matching history entry appears as greyed **ghost text** after the cursor — **→ (ArrowRight) or End accepts it**, any other key ignores it. Familiar from fish shell and modern browser address bars.

```
❯ agent cl​aude --model opus
        ^typed  ^ghost (muted), completes the most recent history entry starting with "agent cl"
```

Entirely client-side in `web/src/CommandInput.tsx`: derive the suggestion from the tab's `cmdHistory` (already passed in as the `history` prop) and render the remainder as a muted `<span>` overlaid on the input.

## Design decisions

**Most recent match, not longest.** The feature description says both "most recent matching history entry" and "longest prefix match" — these conflict when several entries share the typed prefix. Follow fish/browser behavior: the most recent strictly-longer entry wins. **The newest entry is the LAST element of `history`**: proof is ArrowUp recall, which starts at `history.length - 1` (`web/src/CommandInput.tsx:56`). So the matcher walks the array from the end backwards and returns the first hit.

**The ghost is pure derived state — no dismissal state, no effects, no memo.** The suggestion is a plain function call on `(history, value)` each render (per-tab history is small; skipping `useMemo` avoids a dependency-array mistake and a new import). Empty input → no ghost. No match → no ghost. Exact match (entry === value) → no ghost, because a match must be *strictly longer* than the typed text. "Any other key ignores it" falls out for free: typing changes `value`, which re-derives (or removes) the ghost; there is nothing to dismiss and no stale state to manage. Up/Down history recall also just works — a recalled entry equals a history entry exactly, so it shows no ghost unless a longer entry shares the prefix (harmless, arguably useful).

**One acceptance rule, stated once:** ArrowRight and End both accept **iff a ghost is showing AND the caret is a collapsed cursor at the end of the typed text** (`selectionStart === selectionEnd === value.length`). In every other situation the key falls through to native behavior. Consequences, spelled out so nobody re-derives them differently: ArrowRight mid-text moves the caret (native); End mid-text jumps to the end of the typed text (native), and a second End then accepts; Shift+→ (selection) and Ctrl chords never reach the switch at all — the existing guard at `web/src/CommandInput.tsx:33` returns early on any shift/ctrl modifier.

**Accepting behaves exactly like having typed the suggestion.** Reuse the existing `recall` (`web/src/CommandInput.tsx:25-28`) to set the value and park the cursor at the end, and clear `completions` — because typing clears them too (`onChange`, `web/src/CommandInput.tsx:85`). Leave `histIndex` alone — typing doesn't touch it either.

**Render via a mirror overlay; one CSS rule owns the font metrics.** The command line is a real `<input>`, so the ghost can't live inside it. Overlay an absolutely-positioned, `pointer-events: none` span containing the typed text rendered invisible (`visibility: hidden`) followed by the ghost remainder in `var(--muted)`. Alignment holds only if the overlay and the input share identical font metrics, so do **not** duplicate the font declarations — move them into a combined selector (`.command input, .command .ghost`) so there is a single source of truth that cannot drift. The input already has `background: transparent` and no padding/border of its own (`web/src/theme.css:214-217`; the padding lives on `.command`, `:212`), which is what makes the overlay technique work here without compensating offsets. Long lines degrade gracefully (`overflow: hidden` — the ghost simply clips).

**Extract the matcher into a module.** Mirrors the repo pattern (`history.ts`, `command-completion.ts`, recent extraction commits): a tiny pure function in a new `web/src/ghost-suggestion.ts`, unit-tested like `history.test.ts`. Keeps `CommandInput.tsx` well under the 200-line limit and the logic trivially testable without DOM.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Command input component (all component changes land here) | `web/src/CommandInput.tsx` |
| Per-tab history prop (server-provided `cmdHistory`, newest last) | `web/src/App.tsx:177` → `history` prop |
| Proof of history order (ArrowUp starts at the end) | `web/src/CommandInput.tsx:56` (`histIndex.current === -1 ? history.length - 1`) |
| Key switch to extend (add cases before `// No default`) | `web/src/CommandInput.tsx:39-71` (`switch (e.key)` through `// No default`) |
| Shift/Ctrl early-return (protects chords & selection keys) | `web/src/CommandInput.tsx:33` (`if (e.shiftKey || e.ctrlKey) return;`) |
| `recall` — set value + cursor at end (reuse for acceptance) | `web/src/CommandInput.tsx:25-28` (`const recall = (text: string) => { … }`) |
| Typing clears completions (acceptance must match) | `web/src/CommandInput.tsx:85` (`setCompletions([])` in `onChange`) |
| Command-line DOM to wrap | `web/src/CommandInput.tsx:77-88` (`.command` div containing the `<input>`) |
| Input CSS rule to split (transparent bg, mono font) | `web/src/theme.css:214-217` |
| Pure-function + test pattern to mirror | `web/src/history.ts`, `web/src/history.test.ts` |
| Component test pattern to mirror | `web/src/TabStrip.test.tsx` (vitest + `@testing-library/react` + `userEvent`) |
| Muted color token | `var(--muted)` (used by `.completions`, `theme.css:211`) |

## Implementation steps

Do them in this order; the checkpoint after step 4 proves the wiring compiles, lints, and aligns before writing tests.

1. **New `web/src/ghost-suggestion.ts`** — the pure matcher. This snippet is the contract; the newest-last walk direction is the one thing easy to get backwards:

   ```ts
   // The ghost-text suggestion for the command line: the most recent history entry that starts
   // with the typed text and extends it. History is ordered oldest → newest, so walk backwards.
   // Returns undefined when the input is empty or nothing strictly longer matches.
   export function findGhostSuggestion(history: string[], typed: string): string | undefined {
     if (typed === '') return undefined;
     for (let index = history.length - 1; index >= 0; index--) {
       const entry = history[index];
       if (entry.length > typed.length && entry.startsWith(typed)) return entry;
     }
     return undefined;
   }
   ```

   Case-sensitive, plain `startsWith` — commands are exact strings. No options, no normalization.

2. **`web/src/CommandInput.tsx` — derive and accept.** Import `findGhostSuggestion` (extensionless import — repo convention in `web/src`; match the file's existing imports). In the component body: `const ghost = findGhostSuggestion(history, value);` — a plain call, no `useMemo`. Add two shared cases to the switch, **inside** the existing `switch (e.key)` and **before** the `// No default` comment:

   - `case 'ArrowRight': case 'End':` — read the caret from `inputRef.current`; if a ghost exists and `selectionStart === selectionEnd === value.length`, call `e.preventDefault()`, then `recall(ghost)` and `setCompletions([])`; otherwise just `break` so the key keeps its native behavior. Do **not** call `preventDefault` on the fall-through path, do **not** touch `histIndex`, and do **not** re-implement `recall`.

3. **`web/src/CommandInput.tsx` — render the overlay.** Wrap the `<input>` (`:80-87`) in a `<div className="input-wrap">`; when `ghost` is set, render the ghost span **inside** `.input-wrap`, before the `<input>`:

   ```tsx
   <span className="ghost" aria-hidden="true">
     <span className="ghost-typed">{value}</span>{ghost.slice(value.length)}
   </span>
   ```

   `aria-hidden` keeps the mirror out of the accessibility tree; the real input's value is unchanged until acceptance. Change nothing else about the input element or its props.

4. **`web/src/theme.css`** — extend the `/* Command input */` block (`:209-217`) only:

    - Split the existing `.command input` rule (`:214-217`): keep `flex: 1; background: transparent; border: none; outline: none; color: var(--fg);` on `.command input`, and move the two font declarations (`font-family: var(--mono); font-size: 13.1625px;`) into a new combined rule `.command input, .command .ghost { … }` — the single source of truth for alignment. Do not retype the font-size; cut and paste it.
   - Add `position: relative;` to `.command input`. Without it the absolutely-positioned ghost paints **on top of** the input (positioned elements paint above in-flow siblings regardless of DOM order) and can obscure the caret; making the input positioned too restores DOM-order painting, putting the ghost behind.
   - New rules:
     - `.command .input-wrap { position: relative; flex: 1; display: flex; }`
     - `.command .ghost { position: absolute; inset: 0; display: flex; align-items: center; color: var(--muted); white-space: pre; overflow: hidden; pointer-events: none; }`
     - `.command .ghost .ghost-typed { visibility: hidden; }`

   The input keeps its existing `flex: 1`, which now applies inside the new flex wrapper — no change needed there.

   **Checkpoint:** `./scripts/run.mjs check-diff` passes, and manually: type a prefix of a past command — the grey remainder lines up exactly with the caret (any horizontal offset means the font declarations didn't end up shared).

5. **Tests** — next section, then re-run the checkpoint.

## Tests

**New `web/src/ghost-suggestion.test.ts`** (mirror `history.test.ts` style):

- Most recent wins: history `['git log', 'git status']`, typed `'git'` → `'git status'` (this case fails if the walk direction is backwards — keep it).
- Returns `undefined` for: empty input; no matching entry; an exact match with nothing to extend (`['ls']`, typed `'ls'`).
- Matching is case-sensitive (`['Git status']`, typed `'git'` → `undefined`) and anchored at the start (`['agent foo']`, typed `'gent'` → `undefined`).

**`CommandInput.test.tsx`** (extend it if the transcript-click-prefill plan already created it, else create it, mirroring `TabStrip.test.tsx` imports). Notes to avoid jsdom dead ends:

- The ghost is `aria-hidden`, so query it with `container.querySelector('.ghost')`, not `screen.getByText`.
- `userEvent.type` leaves the caret at the end — the accepting position. For the mid-text case, call `input.setSelectionRange(n, n)` first, then `fireEvent.keyDown(input, { key: 'ArrowRight' })`.
- `recall` positions the cursor inside `requestAnimationFrame`, which doesn't run in these tests — assert the input's **value** after acceptance, not the cursor position.

Cases:

- Typing a prefix of a history entry renders `.ghost` whose text ends with the remainder; typing a non-matching string renders no `.ghost`.
- ArrowRight at end-of-input with a ghost sets the input value to the full suggestion; ArrowRight with the caret mid-text does not change the value.
- End at end-of-input with a ghost accepts; Enter without ever accepting submits only the typed value (assert the `onSubmit` mock).

## Verification

- `./scripts/run.mjs check-diff` after step 4 and again after tests. Do **not** run `npm run check`.
- Manual: run a few commands in a tab, then type a prefix of one — the grey remainder appears after the caret, pixel-aligned; → or End completes it; typing a diverging character makes it vanish; Backspace re-derives it; Shift+→ still selects; Up/Down recall and Tab completion behave exactly as before.

## Pitfalls (each is a plausible wrong turn)

- **Walking history from index 0.** Newest is last (`ArrowUp` starts at `history.length - 1`, `CommandInput.tsx:56`); walking forward returns the *oldest* match. The "most recent wins" unit test exists to catch exactly this.
- **Duplicating the font declarations into `.command .ghost`.** Works today, silently misaligns the moment someone edits the input's font. Share one rule instead (step 4).
- **Forgetting `position: relative` on the input.** The ghost then paints over the caret. It's a paint-order rule, not a layout one — nothing else moves.
- **`preventDefault` on the non-accepting path** of ArrowRight/End — kills native caret movement. Only prevent when actually accepting.
- **Accepting without clearing `completions`.** Typing clears them (`onChange`, `:85`); acceptance must match or a stale completion list lingers over the new value.
- **Putting the new cases after `// No default`** or outside the switch — the shift/ctrl guard and `Tab` handling above the switch must keep running first.
- **Adding `.js` to the new import.** The NodeNext extension rule applies to `src/` only; `web/src` imports stay extensionless.
- **Line numbers drift.** All `file:line` references are planning-time anchors — locate by the quoted code if the file has changed.

## Out of scope

- **Server involvement.** `cmdHistory` already arrives with every state broadcast; no protocol or server change.
- **Fuzzy / substring / case-insensitive matching.** Prefix-only, exact case — matching fish.
- **Partial acceptance** and any "dismiss ghost" key — the ghost is derived state; there is nothing to dismiss. Word-wise accept is a follow-up (below).
- **Ghost text during history walking UX tweaks** — a recalled entry may show a ghost if a longer entry shares its prefix; accepted as harmless.
- **Suppressing the ghost while the Tab-completion list is visible** — both can show at once; accepted as harmless.
- **Ctrl+F / Ctrl+E accept keys.** Fish and PSReadLine also accept via Ctrl chords, but this app deliberately defers all Ctrl/Shift chords to the window handler (`CommandInput.tsx:33`); → and End are the bindings shared by every major implementation, so nothing familiar is lost.

## Follow-up: word-wise partial accept (Alt+→)

All three major precedents offer a partial accept that takes the suggestion one word at a time: fish (Alt+→ / Alt+F), zsh-autosuggestions (`forward-word` in `ZSH_AUTOSUGGEST_PARTIAL_ACCEPT_WIDGETS`), and PSReadLine (rebinding to `ForwardWord`). It is the most common second iteration of this feature — not table stakes for the first release, but the natural next step.

When picking this up:

- **Binding: Alt+→ (`e.altKey && e.key === 'ArrowRight'`).** Alt is not intercepted by the existing Shift/Ctrl early-return, so it needs its own check *before* that guard. Same gate as full accept: ghost present, caret at end.
- **Semantics:** extend `value` by one word of the remainder — `value + remainder up to and including the next word boundary`. Match fish: a "word" ends at the next run of non-word characters, so repeated Alt+→ walks the suggestion chunk by chunk; the final chunk completes it.
- **Implementation:** add a pure `nextWordBoundary(remainder: string): number` (or `acceptOneWord(typed, suggestion)`) helper to `ghost-suggestion.ts` with unit tests (multi-word command, trailing spaces, single word left), then a small `case` in the key switch that calls `recall(value + chunk)`. The ghost re-derives automatically from the new longer prefix — no extra state.
