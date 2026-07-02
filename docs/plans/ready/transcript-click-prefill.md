# Input pre-fill from transcript click

**Complexity: 2/10** — entirely client-side wiring: an `onClick` on prompt lines, a prefill ref threaded through App into CommandInput reusing the existing `recall`, one CSS line, and a handful of component tests.

## Goal

Clicking any prompt line (`❯ <command>`) in the transcript copies that command into the command bar, ready to re-run or edit. Eliminates scrolling back through history to re-run a command seen on screen. Wired as an `onClick` on `type === 'prompt'` lines in the transcript renderer.

Entirely client-side: the prompt line already carries its command text (`line.text` on `BufferLine`), and the command bar just needs a way to accept a value from the outside. No protocol or server change.

## Design decisions

**Only the plain `❯` prompt branch gets the click.** `renderLine` (`web/src/transcript-line.tsx:31`, `if (line.type === 'prompt')`) has two prompt branches: the ACP variant (`line.acp`) already uses click to toggle collapse, and its text is an agent prompt rather than a command. The ACP branch keeps its existing behavior untouched; only the non-ACP branch (the one rendering `❯ {line.text}`) pre-fills.

**Pre-fill replaces the current input value.** Clicking a prompt is an explicit "I want this command" gesture, and replacing whatever partial text is in the bar matches how Up/Down history recall already behaves in `CommandInput`. No merging or insertion at the cursor.

**Expose a prefill function through a ref owned by App — do not lift the input's `value` state.** `CommandInput` owns `value` internally (`web/src/CommandInput.tsx:20`), and lifting it into App would ripple through history recall, completion, and submit handling for no benefit. Instead, App holds a ref to a "set the input to this text" function and passes it down; `CommandInput` fills the ref with a function that reuses the existing `recall` helper (`web/src/CommandInput.tsx:25`, sets the value and parks the cursor at the end) and then resets the same state a fresh recall leaves behind: `histIndex` back to -1 and completions cleared. This mirrors the handle-ref pattern App already uses for `harnessHandles` / `shellHandles` (`web/src/App.tsx:36-37`).

**Don't steal clicks from text selection.** The transcript body copies any mouse selection to the clipboard on mouseup (`web/src/App.tsx:157-162`). A drag-select that starts and ends on a prompt line still fires a click on that line, so the prompt's click handler must bail when the current selection (via `globalThis.getSelection()`) is non-empty. Selecting text from a prompt line keeps working; a plain click pre-fills.

**Do not stop propagation in the prompt click handler.** The click must bubble up to the `.tab-body` `onClick` (`web/src/App.tsx:156`), which is what focuses the command input — so focus comes for free. Stopping propagation would leave the input filled but unfocused.

**Prefill `line.text` only.** The `cwd` span on a prompt line is display context, not part of the command.

**Affordance:** the plain prompt line gets `cursor: pointer` and a short `title` tooltip, matching how the ACP prompt line (`web/src/theme.css:137`) already signals clickability.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Prompt line rendering (the click target) | `web/src/transcript-line.tsx:39-44` (non-ACP branch) |
| `recall` — set value + cursor at end | `web/src/CommandInput.tsx:25-28` |
| History-index / completions state to reset | `web/src/CommandInput.tsx:21-22` |
| Reset pattern to mirror (Enter clears value, completions, histIndex) | `web/src/CommandInput.tsx:47-49` |
| `inputRef` typing to mirror for `prefillRef` | `web/src/CommandInput.tsx:10` (`React.RefObject<… \| null>`) |
| Handle-ref pattern to mirror | `web/src/App.tsx:36-37` (`harnessHandles`, `shellHandles`) |
| Tab-body click → focus input (makes the prefill land focused) | `web/src/App.tsx:152-162` |
| Selection-copy behavior to preserve | `web/src/App.tsx:157-162` |
| Prompt line CSS to extend | `web/src/theme.css:127-128` |
| Component test pattern to mirror | `web/src/TabStrip.test.tsx` (vitest + `@testing-library/react` + `userEvent`) |

## Implementation steps

1. **`web/src/transcript-line.tsx`** — add a required `onPromptClick: (text: string) => void` parameter to `renderLine`. In the non-ACP prompt branch only, add a `title` tooltip and an `onClick` that returns early when the current selection is non-empty, otherwise calls `onPromptClick(line.text)`. Use `globalThis` rather than `window` (repo convention, see `App.tsx:158`). No `stopPropagation`, no `preventDefault`.
2. **`web/src/Transcript.tsx`** — add the same required `onPromptClick` prop and pass it through to `renderLine` (`web/src/Transcript.tsx:43`).
3. **`web/src/CommandInput.tsx`** — add a required `prefillRef` prop, typed exactly like the existing `inputRef` prop (`web/src/CommandInput.tsx:10`) but for a function: `React.RefObject<((text: string) => void) | null>`. Assign the ref's current value on every render (a plain statement, no `useEffect` and no `useImperativeHandle` — this always closes over fresh state, same as `inputRef` is used) to a function that calls `recall(text)`, resets `histIndex.current` to `-1`, and clears completions via `setCompletions([])`. Do not duplicate `recall`'s logic; call it. Mirror the reset pattern at `web/src/CommandInput.tsx:47-49` where Enter does the same three things.
4. **`web/src/App.tsx`** — declare `const prefillReference = useRef<((text: string) => void) | null>(null);` next to the other `-Reference`-suffixed refs (`web/src/App.tsx:34-38`), matching the naming convention (`inputReference`, `transcriptReference`, `clientReference`). Wire both ends: `onPromptClick={(text) => prefillReference.current?.(text)}` on `<Transcript>` and `prefillRef={prefillReference}` on `<CommandInput>`.

   **Checkpoint:** `./scripts/run.mjs check-diff` (lint + typecheck + tests). New props are required, so the typecheck stays red until steps 1–4 are all wired — that proves the wiring is complete.
5. **`web/src/theme.css`** — on the existing rule at `web/src/theme.css:127`, add `cursor: pointer;` so it reads `.line.prompt { color: var(--accent); cursor: pointer; }`. Change nothing else in the file. (The ACP variant at `:137` already has `cursor: pointer` — leave it alone.)

6. **Tests** — see next section, then re-run the checkpoint.

## Tests

New `web/src/transcript-line.test.tsx`, mirroring `TabStrip.test.tsx` structure (vitest's `describe/expect/it/vi`, `render`/`screen` from `@testing-library/react`, `userEvent`). Notes to avoid dead ends:

- Build test lines with a `makePromptLine(overrides)` helper like `makeTab` in `web/src/TabStrip.test.tsx:8-24`. Check `BufferLine` in `@shared/protocol` for required fields — don't guess them.
- `renderLine` returns JSX, so render it directly: `render(<>{renderLine(line, 0, client, onToggleCollapse, onPromptClick)}</>)`. Only the `terminal` branch uses `client`, so a cast stub (`{} as JanusClient`) is fine for prompt-line tests.
- To simulate an active text selection, spy with `vi.spyOn(globalThis, 'getSelection')` returning an object whose `toString()` gives non-empty text (cast to `Selection`); restore after the test.

Cases:

- Clicking a `type: 'prompt'` line calls `onPromptClick` with exactly the line's `text` (use a line also carrying `cwd` to prove cwd is excluded).
- Clicking an ACP prompt line (`acp: true`) calls `onToggleCollapse` and not `onPromptClick`.
- With the selection spy active, clicking a prompt line does not call `onPromptClick`.

`CommandInput` prefill behavior — `CommandInput.test.tsx` does not exist yet so create it:

- Construct a ref with `{ current: null }` matching `React.RefObject<((text: string) => void) | null>`; render `CommandInput`; call `prefillRef.current!('git status')` inside `act(...)`; assert the input's value is `git status`.
- After prefill, pressing Enter submits `git status` (asserts `onSubmit` mock), and a fresh ArrowUp recalls the most recent history entry (proves `histIndex` was reset).

## Verification

`./scripts/run.mjs check-diff` after the wiring and again after tests. Manual: run a few commands, scroll up, click an old `❯` line — its command appears in the command bar, focused, cursor at the end; Enter re-runs it. Drag-select text on a prompt line — it copies to the clipboard and does not pre-fill. Click an ACP `+` line — it still toggles collapse.

## Out of scope

- Auto-running the clicked command — click pre-fills only; Enter runs. (The history picker already covers click-to-run.)
- ACP prompt lines — they keep their collapse-toggle click.
- Clicking output lines to copy their text — selection-copy already covers that.
- Server involvement — the prompt text is already in every `BufferLine`; no protocol change.

## Pitfalls (each of these has bitten similar changes)

- **`stopPropagation` in the prompt click handler** breaks focus — the bubble to `.tab-body` is what focuses the input. Don't add it.
- **Wiring the ACP prompt branch too.** Only the plain `❯` branch gets `onPromptClick`; the ACP branch already has `onClick={onToggleCollapse}`.
- **Optional props (`onPromptClick?`, `prefillRef?`).** Keep them required so the compiler catches incomplete wiring.
- **Wrapping the `prefillRef.current` assignment in an effect or `useImperativeHandle`.** A plain per-render assignment is the point — it always closes over fresh state, same as how `inputRef` is used.
- **Adding `.js` extensions to web imports.** The NodeNext `.js`-extension rule in `eslint.config.mjs` applies to `src/` only; `web/src` imports stay extensionless — match the file's existing imports.
- **Line numbers drift.** All `file:line` references in this plan are anchors from planning time — locate by the quoted code/identifier, not the number, if the file has changed.
