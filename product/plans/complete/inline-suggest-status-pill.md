# Inline Persona-Suggestion Status Pill

**Complexity:** 3/10

## Goal

The `>`-led persona-suggestion request line (see `product/specs/editor-tab.md` "In-editor persona
suggestions") currently gives no inline feedback about its own state — whether it names a known
persona, has a prompt yet, is mid-flight, or came back empty. Add a small status pill rendered at
the end of that line, whose text reflects the request's current state, ending in a clickable
`[run]` button that fires the same query as Ctrl/Cmd+Enter:

- No known persona named yet → `[agent?]`
- Persona named, no prompt text yet → `[query?]`
- Persona + prompt ready, not yet fired → `[run]` (clickable button)
- Request in flight → `[running...]`
- Reply came back with no proposed change → `[no suggestion]`

## Approach

This reuses the existing single-line parsing (`suggest-request.ts`) and per-request state
(`useEditorSuggest.ts`) added for personas suggestions (6f3293e) rather than introducing a new
state machine. Two small additions carry it:

1. `useEditorSuggest` gains two reactive values already tracked internally only as a ref
   (`firingRef`) or not tracked at all (the "came back empty" outcome): `firingLine` (the line text
   currently in flight) and `noSuggestionLine` (the line text of the last empty-hunks reply).
2. A new pure function in `suggest-request.ts`, `suggestPillLabel`, maps a line's text plus that
   state into the label to render (or `undefined` for a line that isn't `>`-led at all).

Rendering plugs into the existing per-line render path (`render.tsx`'s `EditorLine`) as one more
inline span, and the click is handled by delegation on the existing `.editor-body` container
(mirroring how mouse-down selection already delegates there) rather than a new per-line callback
prop, so `EditorLine` stays a cheap, referentially-stable `React.memo`.

## Implementation

### `web/src/editor/suggest-request.ts`

- Export the existing private `personaToken` helper (just add the `export` keyword — no behavior
  change).
- Add:

```ts
export type SuggestPill = { text: string; runnable: boolean };

export function suggestPillLabel(
  line: string,
  personas: string[],
  firingLine: string | null,
  pendingLine: string | null,
  noSuggestionLine: string | null,
): SuggestPill | undefined {
  const token = personaToken(line);
  if (!token) return undefined;
  const persona = personas.find((p) => p.toLowerCase() === token.word.toLowerCase());
  if (!persona) return { text: '[agent?]', runnable: false };
  const prompt = line.slice(token.end).trimStart();
  if (!prompt) return { text: '[query?]', runnable: false };
  if (line === firingLine) return { text: '[running...]', runnable: false };
  if (line === pendingLine) return undefined; // PendingSuggestPanel already owns this line's state
  if (line === noSuggestionLine) return { text: '[no suggestion]', runnable: false };
  return { text: '[run]', runnable: true };
}
```

### `web/src/editor/useEditorSuggest.ts`

- Add `const [firingLine, setFiringLine] = useState<string | null>(null);` and
  `const [noSuggestionLine, setNoSuggestionLine] = useState<string | null>(null);`.
- In `fireOnLine`, set `setFiringLine(lineText)` alongside `firingRef.current = true`.
- In the request's `.then`, set `setFiringLine(null)` alongside `firingRef.current = false`; when
  `hunks.length === 0`, call `setNoSuggestionLine(lineText)`.
- Add `firingLine` and `noSuggestionLine` to `EditorSuggestApi` and the hook's return value.

### `web/src/editor/render.tsx`

- Add `pill?: SuggestPill` to `LineProps`.
- In `EditorLine`, after the existing `contentSegments` span, render:

```tsx
{pill && (
  <span className={pill.runnable ? 'editor-suggest-pill editor-suggest-pill-run' : 'editor-suggest-pill'}>
    {pill.text}
  </span>
)}
```

### `web/src/EditorTab.tsx`

- Import `suggestPillLabel` from `./editor/suggest-request`.
- Per rendered line, compute
  `suggestPillLabel(text, suggest.personas, suggest.firingLine, suggest.pending?.requestLineText ?? null, suggest.noSuggestionLine)`
  and pass it as `pill={...}` to `<EditorLine>`.
- Add an `onClick` handler to the existing `.editor-body` div (alongside its `onMouseDown`) that
  checks whether the click landed on `.editor-suggest-pill-run`, reads the ancestor row's
  `data-editor-line` attribute (already set today), and calls `suggest.fireOnLine(state, lineIndex)`
  when so — the same call Ctrl/Cmd+Enter already makes.

### `web/src/theme.css`

Add, near the existing `.editor-save-button` rules:

```css
.editor-suggest-pill { margin-left: 8px; font-size: 12px; color: var(--faint); }
.editor-suggest-pill-run {
  padding: 0 4px; background: var(--accent); color: var(--bg); border-radius: 2px; cursor: pointer;
}
.editor-suggest-pill-run:hover { opacity: 0.85; }
```

## Tests

- `web/src/editor/suggest-request.test.ts`: new `describe('suggestPillLabel', ...)` covering each
  of the five states plus the "not a `>` line at all" (`undefined`) and "pending line suppressed"
  cases.
- `web/src/editor/useEditorSuggest.test.ts`: extend the existing "fires a request" test to assert
  `firingLine` is set during the in-flight request and cleared after; add a new test asserting
  `noSuggestionLine` is set when the reply's `hunks` array is empty.

## Spec

Update `product/specs/editor-tab.md`'s "In-editor persona suggestions" section to describe the
status pill and its five states.

## Out of scope

- Issue B (rendering pending suggestion changes as inline diff highlighting instead of the
  `PendingSuggestPanel` block) — separate, larger issue, left in the backlog.
- Any change to the underlying fire/accept/decline flow or server protocol.
- Clearing a stale `noSuggestionLine`/pill state if the user retypes the exact same line text after
  editing away and back — matches by exact text, same as the existing `pending.requestLineText`
  matching already does.
