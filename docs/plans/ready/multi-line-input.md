# Multi-line input mode

**Complexity: 5/10** — the `<input>` → `<textarea>` swap itself is mechanical, but the keyboard handler has four interacting concerns (Shift+Enter newline, Enter submit, ArrowUp/Down line-aware history recall, ghost-text overlay alignment on wrapped lines) that each need careful gating. The auto-resize + ghost overlay combination is the trickiest CSS part.

## Goal

Shift+Enter inserts a newline in the command bar rather than submitting, letting the user compose multi-line ACP prompts or shell heredocs before sending. Plain Enter still submits. The input grows vertically to fit its content (up to a max height), and ArrowUp/Down navigate within multi-line text — only recalling history when the caret is on the first/last line respectively.

```
❯ Dear agent, please
  analyze the following:
  - item one
  - item two▌
           ^ Shift+Enter inserted newlines; plain Enter will submit the whole block
```

## Design decisions

**`<input>` → auto-resizing `<textarea>` with `rows={1}`.** A `<textarea>` is the only native element that supports multi-line text entry. Start at one row; grow on every `input` event by resetting `height` to `'0'` then setting it to `scrollHeight + 'px'`. Cap growth at `max-height` (~6 lines) with `overflow-y: auto` so the command area never consumes the whole viewport. The `rows={1}` attribute gives the correct initial height without a CSS hack.

**Shift+Enter inserts a newline; plain Enter submits.** The existing `if (e.shiftKey || e.ctrlKey) return;` guard at `web/src/CommandInput.tsx:30` defers **all** Shift/Ctrl chords to the window handler — including Shift+Enter. This must change: intercept Shift+Enter **before** that guard, inserting `\n` at the caret via `document.execCommand('insertText', false, '\n')` (which fires an `input` event, triggering auto-resize and `onChange`). Plain Enter (no modifier) keeps its existing submit behavior. Ctrl+Enter also submits (a common convention for "send" in multi-line contexts — matches Slack, Discord, GitHub).

**ArrowUp/Down are line-aware.** When the textarea has only one line (no `\n` in `value`), ArrowUp/Down behave exactly as today (history recall). When the value contains newlines:
- **ArrowUp:** if the caret is on the first line (no `\n` before `selectionStart`), recall previous history. Otherwise, let the native behavior move the caret up one line.
- **ArrowDown:** if the caret is on the last line (no `\n` after `selectionStart`), recall next history. Otherwise, let the native behavior move the caret down one line.

This means history recall only fires when the caret is already at the boundary of the text — a natural and discoverable behavior. Implementation: check `value.lastIndexOf('\n', selectionStart - 1)` for "on first line" and `value.indexOf('\n', selectionStart)` for "on last line".

**Ghost text overlay adapts to wrapping.** The current `.ghost` uses `white-space: pre` which works for single-line input but breaks when text wraps. Change to `white-space: pre-wrap; word-wrap: break-word;` so the ghost span wraps identically to the textarea. The textarea and ghost must share identical `font-family`, `font-size`, `line-height`, `padding`, `letter-spacing`, and `word-wrap` — enforce this in the combined CSS selector (already partially done: `.command input, .command .ghost`). The ghost overlay switches from `align-items: center` (vertically centering single-line text) to `align-items: flex-start` (top-aligning with the textarea's first line).

**The `.command` row top-aligns.** Currently `.command { align-items: center }` vertically centers the dot and prompt relative to the input. When the textarea grows, the dot and `❯` should stay pinned to the first line. Change to `align-items: flex-start` and add a `line-height`-matching `padding-top` to the dot/prompt so they align with the textarea's first text baseline.

**Ref type widens from `HTMLInputElement` to `HTMLTextAreaElement`.** Four files reference the ref type: `CommandInput.tsx`, `App.tsx`, `command-completion.ts`, and `useQuitConfirm.ts`. All four must change. `HTMLTextAreaElement` has the same `selectionStart`, `selectionEnd`, `setSelectionRange`, and `focus` APIs as `HTMLInputElement`, so no behavioral changes are needed beyond the type annotation.

**`onSubmit` receives the full multi-line string.** The existing `App.tsx` submit handler trims-then-lowercases to check for `hist`/`quit`/`close`/`exit` — these special commands will never contain newlines, so the existing logic works unchanged. Multi-line text falls through to `runCommand(text)` which sends it verbatim over WebSocket. No server change needed.

**Auto-resize via a `useEffect` on `value`.** Rather than hooking the `input` event directly, use a `useEffect` keyed on `value` that resets and reads `scrollHeight`. This keeps the resize logic in React's render cycle and avoids a separate event listener. The effect runs after every value change (typing, paste, history recall, ghost acceptance, Shift+Enter newline) — all cases are covered.

**Shift+Arrow and Ctrl+Arrow chords are intentionally deferred to the window handler.** The existing `if (e.shiftKey || e.ctrlKey) return;` guard (after the new Shift+Enter/Ctrl+Enter exceptions) continues to defer Shift+ArrowUp/Down to `useTranscriptScroll` (transcript scrolling, `web/src/useTranscriptScroll.ts:15-29`) and Shift/Ctrl+ArrowLeft/Right to `useWindowKeys` (tab reordering/moving, `web/src/useWindowKeys.ts:46-49`). This means text selection via Shift+ArrowLeft/Right within the textarea is not available — it triggers tab operations instead. This matches the existing single-line behavior (the guard already defers these chords) and is an accepted trade-off: the command bar prioritizes tab management chords over text selection.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Command input component (all component changes land here) | `web/src/CommandInput.tsx` |
| Shift/Ctrl early-return guard (must be modified, not removed) | `web/src/CommandInput.tsx:30` |
| Enter submit case (keeps submit, loses Shift+Enter deferral) | `web/src/CommandInput.tsx:37-48` |
| ArrowUp/Down history recall (gated by line-position checks) | `web/src/CommandInput.tsx:50-65` |
| Ghost text overlay (CSS changes for wrapping) | `web/src/CommandInput.tsx:87-92` |
| `recall` helper (works unchanged — `selectionStart`/`End` exist on textarea) | `web/src/CommandInput.tsx:22-25` |
| Tab completion (cursor math is element-agnostic, but token extraction needs `\n` as a boundary — see step 6 note) | `web/src/command-completion.ts:12-13` |
| Ref owner and focus management | `web/src/App.tsx:39` |
| Quit dialog refocus (needs type widening only) | `web/src/QuitDialog/useQuitConfirm.ts:6` |
| Command input CSS block | `web/src/theme.css:216-228` |
| Existing component tests (extend, don't replace) | `web/src/CommandInput.test.tsx` |

## Implementation steps

Do them in this order. The checkpoint after step 3 proves the textarea renders, resizes, and submits before layering on the harder keyboard changes.

### 1. Widen the ref type across all four files

- `web/src/CommandInput.tsx:11` — `inputRef: React.RefObject<HTMLTextAreaElement | null>`
- `web/src/CommandInput.tsx:27` — `React.KeyboardEvent<HTMLTextAreaElement>`
- `web/src/App.tsx:39` — `useRef<HTMLTextAreaElement>(null)`
- `web/src/command-completion.ts:10` — `inputRef: RefObject<HTMLTextAreaElement | null>`
- `web/src/QuitDialog/useQuitConfirm.ts:6` — `inputRef: RefObject<HTMLTextAreaElement | null>`

No behavioral changes — just the type annotations. Everything compiles because `HTMLTextAreaElement` has the same selection/focus API surface.

### 2. Swap `<input>` for `<textarea>` in `CommandInput.tsx`

Replace the `<input>` element (line 93-100) with:

```tsx
<textarea
  ref={inputRef}
  rows={1}
  value={value}
  autoFocus
  spellCheck={false}
  onChange={(e) => { setValue(e.target.value); setCompletions([]); }}
  onKeyDown={onKeyDown}
/>
```

Add a `useEffect` after the state declarations for auto-resize:

```tsx
useEffect(() => {
  const el = inputRef.current;
  if (!el) return;
  el.style.height = '0';
  el.style.height = el.scrollHeight + 'px';
}, [value, inputRef]);
```

Import `useEffect` from React (add to the existing import).

**Line budget:** `CommandInput.tsx` is currently 105 lines. After steps 2–5 it will reach ~155 lines — still under the 200-line `max-lines` limit (`eslint.config.mjs:60`) but with limited headroom. If subsequent features push it past 200, extract the `onKeyDown` handler into a `web/src/useCommandKeys.ts` hook (mirroring the `useTranscriptScroll` extraction pattern at `web/src/useTranscriptScroll.ts`), returning the handler function and taking `value`, `setValue`, `history`, `recall`, etc. as parameters.

### 3. Update CSS in `theme.css`

Replace the `.command input` rules in the `/* Command input */` block:

```css
.command { display: flex; align-items: flex-start; gap: 8px; padding: 8px 12px; border-top: 1px solid var(--border); }
.command .dot { font-size: 10px; line-height: 1.6; }
.command textarea {
  flex: 1; background: transparent; border: none; outline: none;
  color: var(--fg); position: relative; resize: none;
  max-height: 9em; overflow-y: auto;
}
.command textarea, .command .ghost { font-family: var(--mono); font-size: 13.1625px; line-height: 1.6; }
.command .ghost { position: absolute; inset: 0; display: flex; align-items: flex-start; color: var(--muted); white-space: pre-wrap; word-wrap: break-word; overflow: hidden; pointer-events: none; }
```

Key changes from the current CSS:
- `.command` → `align-items: flex-start` (was `center`)
- `.command .dot` → add `line-height: 1.6` (aligns dot with first text line)
- The `❯` prompt character is a bare `<span>` with no class (see `CommandInput.tsx:86`). It needs `line-height: 1.6` too, to align with the textarea's first text line. Options: add a class to the span, or target it with a CSS sibling selector like `.command .dot + span`. Either way, the rule must exist or the `❯` sits at the body line-height (~1.5) and drifts ~1px from the textarea's first baseline.
- `.command input` → `.command textarea` (element selector); add `resize: none; max-height: 9em; overflow-y: auto;`
- Combined font rule → `.command textarea, .command .ghost` (was `.command input, .command .ghost`); add `line-height: 1.6`
- `.command .ghost` → `align-items: flex-start` (was `center`); `white-space: pre-wrap; word-wrap: break-word;` (was `pre`)

**Checkpoint:** `./scripts/run.mjs check-diff` passes. Manually: the command bar looks identical for single-line input; typing a long line does NOT create a scrollbar (the textarea grows); pasting multi-line text shows multiple lines. Enter still submits. Ghost text aligns on single-line values.

### 4. Shift+Enter inserts a newline

In `onKeyDown`, **before** the existing `if (e.shiftKey || e.ctrlKey) return;` guard, add:

```tsx
if (e.key === 'Enter' && e.shiftKey) {
  e.preventDefault();
  document.execCommand('insertText', false, '\n');
  return;
}
```

Using `document.execCommand('insertText')` rather than manually splicing `value` because it: (a) correctly handles text replacement when there is a selection (selected text gets replaced by the newline), (b) fires an `input` event which triggers `onChange` → `setValue` → auto-resize, and (c) creates a proper undo entry so Ctrl+Z undoes just the newline.

Also add Ctrl+Enter as a submit shortcut (common multi-line convention). After the Shift+Enter check, before the shift/ctrl guard:

```tsx
if (e.key === 'Enter' && e.ctrlKey) {
  e.preventDefault();
  e.stopPropagation();
  const text = value.trim();
  if (text) onSubmit(text);
  setValue('');
  setCompletions([]);
  histIndex.current = -1;
  return;
}
```

The existing Shift/Ctrl guard (`if (e.shiftKey || e.ctrlKey) return;`) stays in place for all other keys — it still defers Shift+Arrow, Ctrl+Arrow, etc. to the window handler.

### 5. Line-aware ArrowUp/Down

Modify the existing `ArrowUp` and `ArrowDown` cases to check whether the caret is on the first/last line before intercepting for history recall. If the caret is interior, `break` without `preventDefault` so the native line-navigation runs:

```tsx
case 'ArrowUp': {
  const el = inputRef.current;
  if (!el || !value.includes('\n') || el.selectionStart === null) {
    // Single-line: recall history as before
    e.preventDefault();
    if (history.length === 0) return;
    histIndex.current = histIndex.current === -1 ? history.length - 1 : Math.max(0, histIndex.current - 1);
    recall(history[histIndex.current]);
    return;
  }
  // Multi-line: only recall if caret is on the first line
  const beforeCaret = value.lastIndexOf('\n', el.selectionStart - 1);
  if (beforeCaret === -1) {
    e.preventDefault();
    if (history.length === 0) return;
    histIndex.current = histIndex.current === -1 ? history.length - 1 : Math.max(0, histIndex.current - 1);
    recall(history[histIndex.current]);
  }
  // else: native ArrowUp moves caret up one line
  break;
}
case 'ArrowDown': {
  const el = inputRef.current;
  if (!el || !value.includes('\n') || el.selectionStart === null) {
    // Single-line: recall history as before
    e.preventDefault();
    if (histIndex.current === -1) return;
    histIndex.current += 1;
    if (histIndex.current >= history.length) { histIndex.current = -1; setValue(''); }
    else recall(history[histIndex.current]);
    return;
  }
  // Multi-line: only recall if caret is on the last line
  const afterCaret = value.indexOf('\n', el.selectionStart);
  if (afterCaret === -1) {
    e.preventDefault();
    if (histIndex.current === -1) return;
    histIndex.current += 1;
    if (histIndex.current >= history.length) { histIndex.current = -1; setValue(''); }
    else recall(history[histIndex.current]);
  }
  // else: native ArrowDown moves caret down one line
  break;
}
```

### 6. Reset textarea height on submit

After submit (in the Enter case and the Ctrl+Enter case), the `setValue('')` triggers the auto-resize `useEffect`, which resets `scrollHeight` to the single-row height. No extra code needed — the effect handles it.

**But:** the `useEffect` sets `height = '0'` then `height = scrollHeight + 'px'`. When value is `''`, `scrollHeight` is one row — correct. Verify this manually at the checkpoint.

**Tab completion token boundary fix.** `handleTabCompletion` (`web/src/command-completion.ts:12-13`) extracts the token before the cursor using `lastIndexOf(' ')` and `lastIndexOf('\t')` but does not consider `\n`. In multi-line text, pressing Tab on the second line would treat `line1\nfoo` as a single token instead of just `foo`. Add `\n` to the boundary search: `Math.max(before.lastIndexOf(' '), before.lastIndexOf('\t'), before.lastIndexOf('\n')) + 1`. This is a one-line change in `command-completion.ts` and should be covered by a new test case: multi-line input with Tab on the second line completes only the token on that line.

### 7. Tests

Extend `web/src/CommandInput.test.tsx` with new cases. Update the `renderCommandInput` helper: change `createRef<HTMLInputElement>()` (line 8) to `createRef<HTMLTextAreaElement>()`. Update the four `as HTMLInputElement` casts (lines 58, 66, 75, 104) to `as HTMLTextAreaElement`.

**New test cases:**

- **Shift+Enter inserts a newline:** type `hello{Shift>}{Enter}{/Shift}world`, assert the textarea value is `hello\nworld` and `onSubmit` was NOT called.
- **Enter still submits:** type `git status{Enter}`, assert `onSubmit` called with `'git status'` (existing test — verify it still passes).
- **Ctrl+Enter submits:** type `hello{Control>}{Enter}{/Control}`, assert `onSubmit` called with `'hello'`.
- **Multi-line submit sends full text:** type `line1{Shift>}{Enter}{/Shift}line2{Enter}`, assert `onSubmit` called with `'line1\nline2'`.
- **ArrowUp on single-line recalls history:** existing test, verify unchanged.
- **ArrowUp on first line of multi-line recalls history:** set value to `line1\nline2`, place caret at position 0, fire ArrowUp — assert history recall fires.
- **ArrowUp on second line of multi-line does NOT recall:** set value to `line1\nline2`, place caret after the `\n`, fire ArrowUp — assert value is unchanged (native cursor movement).
- **ArrowDown on last line of multi-line recalls history:** set value to `line1\nline2`, place caret at end, fire ArrowDown with an active `histIndex` — assert history recall fires.
- **Auto-resize:** type a multi-line value, assert the textarea's `style.height` is greater than its initial height. (May need to mock `scrollHeight` in jsdom.)
- **Tab completion on second line:** set value to `line1\nfoo`, place caret at end, fire Tab — assert `complete` is called with the token `foo` (not `line1\nfoo`). (This tests the `command-completion.ts` newline boundary fix from step 6.)

**Notes for jsdom limitations:**
- `document.execCommand('insertText')` works in jsdom with `@testing-library/user-event` but the auto-resize `useEffect` may need `waitFor` or `act` to flush.
- `scrollHeight` in jsdom is always `0` unless mocked. For auto-resize tests, spy on the style setter or mock `scrollHeight` on the element.

## Verification

- `./scripts/run.mjs check-diff` after step 3 (textarea swap), after step 5 (keyboard changes), and after step 7 (tests).
- Manual checklist:
  - Single-line input looks and behaves identically to before (no visual regression).
  - Shift+Enter inserts a newline; the textarea grows.
  - Plain Enter submits the full multi-line text.
  - Ctrl+Enter also submits.
  - ArrowUp on the first line recalls history; ArrowUp on an interior line moves the caret up.
  - ArrowDown on the last line recalls history; ArrowDown on an interior line moves the caret down.
  - Ghost text aligns with the typed text on single-line values; on multi-line values the ghost (if any) wraps correctly.
  - Tab completion still works (cursor positioning is correct on a textarea).
  - Tab completion on the second line of a multi-line input completes only the token on that line (not the entire text).
  - After submit, the textarea shrinks back to one row.
  - Pasting multi-line text grows the textarea.
  - Shift+Arrow, Ctrl+Arrow, and all other chords still reach the window handler (tab switching, reordering, scrolling all work).

## Pitfalls

- **The Shift+Enter check MUST come before the `if (e.shiftKey || e.ctrlKey) return;` guard.** Otherwise Shift+Enter is silently swallowed by the guard and the newline never inserts. This is the single most likely bug.
- **Forgetting `resize: none` on the textarea.** Browsers show a manual resize handle by default — confusing alongside auto-resize. Disable it.
- **Using `value` splicing instead of `execCommand`.** Manually setting `setValue(before + '\n' + after)` works but breaks the browser's undo stack (Ctrl+Z can't undo the newline) and doesn't fire an `input` event (so auto-resize won't trigger without extra plumbing). `execCommand('insertText')` handles both.
- **`max-height` too large.** The command area sits at the bottom of the viewport; a 20-line textarea would push the transcript off screen. ~6 lines (`9em` at `line-height: 1.6`) is a reasonable cap — enough for a heredoc or short prompt, not so much that it dominates.
- **Ghost text misalignment on wrapped lines.** The ghost and textarea must share `line-height`, `word-wrap`, and `white-space: pre-wrap`. If any property diverges, the ghost drifts vertically on wrapped lines. The combined CSS selector is the guard against drift.
- **ArrowUp/Down line detection using `value.slice(0, selectionStart).includes('\n')`.** This is wrong for ArrowDown — it checks whether there's a newline *anywhere* before the caret, not whether the caret is on the last line. Use `value.indexOf('\n', selectionStart) === -1` for "on last line" and `value.lastIndexOf('\n', selectionStart - 1) === -1` for "on first line".
- **Not resetting `height` to `'0'` before reading `scrollHeight`.** If the textarea previously grew and then text is deleted, `scrollHeight` won't shrink below the current `height`. Resetting to `'0'` first forces a reflow so `scrollHeight` reflects the actual content.
- **`as HTMLInputElement` casts in tests.** Must change to `as HTMLTextAreaElement` or the test file won't compile after the ref type widens.
- **Line numbers drift.** All `file:line` references are planning-time anchors — locate by the quoted code if the file has changed.
- **Ghost overlay scroll misalignment when textarea scrolls.** When the textarea exceeds `max-height` and becomes scrollable, the ghost overlay (which fills `.input-wrap` via `inset: 0`) does not track the textarea's `scrollTop`. Ghost text stays pinned to the top of the visible wrapper while textarea content scrolls beneath it, breaking alignment. In practice this requires both 6+ lines of input AND a matching ghost suggestion — the latter is near-impossible because ghost suggestions are prefix matches and multi-line values rarely prefix-match a history entry. If it ever surfaces, the fix is to sync the ghost's `transform: translateY(-${textarea.scrollTop}px)` in the auto-resize effect or on a `scroll` event listener.
- **Tab completion token boundary across newlines.** `command-completion.ts:12-13` uses `lastIndexOf(' ')` and `lastIndexOf('\t')` to find the token before the cursor but does not include `\n`. Without the fix (step 6 note), Tab on the second line of a multi-line input treats the entire text up to the cursor as one token.

## Out of scope

- **Server changes.** Multi-line text is sent as a plain string over the existing `command` WebSocket method. The server already handles arbitrary string content.
- **Syntax highlighting in the textarea.** A plain `<textarea>` has no syntax highlighting. CodeMirror/Monaco integration is a much larger effort and not needed for composing prompts.
- **Multi-line entries in history / ghost text.** History recall may return a multi-line entry; it displays correctly in the textarea. Ghost text for multi-line entries works if the ghost overlay wraps correctly — but multi-line ghost alignment is an edge case that can be refined later.
- **History picker display of multi-line entries.** The picker currently shows entries as single lines. Truncation/display of multi-line history entries is a separate UX question.
- **IME composition handling.** The editor tab has `compositionStart`/`compositionEnd` handlers (`EditorTab.tsx`), but the command bar has never needed them and this change doesn't introduce that requirement.
- **Markdown preview of multi-line prompts.** Rendering a preview of the composed text before submission is a potential follow-up, not part of this feature.
- **Shift+ArrowLeft/Right text selection within the textarea.** These chords are already deferred to the window handler for tab reordering/moving (`useWindowKeys.ts:46-49`). Changing this would break existing tab management shortcuts. If text selection becomes important, it would need a modifier remapping strategy (e.g. Alt+Shift+Arrow for selection) that is out of scope here.

## Follow-up: paste-file support

Once the command bar accepts multi-line text, a natural extension is drag-and-drop or paste of file contents into the textarea — the user drops a log snippet or error output and prepends a prompt like "analyze this:". The textarea already receives paste events; the extension is a paste-handler that detects file attachments and inserts their content. Not table-stakes for this feature, but the multi-line textarea is the prerequisite.
