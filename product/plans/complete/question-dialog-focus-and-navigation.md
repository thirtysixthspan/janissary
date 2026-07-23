# Question dialog: initial focus, Tab/arrow cycling, and tab-switch refocus

**Complexity: 4/10** — no new architecture; adds local (non-trapping) roving-focus keyboard
handling to an existing component and one extra imperative-handle wire-up, following patterns
(`forwardRef`/`useImperativeHandle`, `useLatestRef`) already used elsewhere in `web/src/`.

## Goal

In the question dialog (`QuestionPanel.tsx`):

- Opening an **approve** question (options + Cancel) puts keyboard focus on **Cancel**.
- Opening an **ask** question (text input + Submit/Cancel) puts keyboard focus on the **text
  input** (already true via its existing `autoFocus`).
- **Tab** cycles keyboard focus forward between the dialog's answer buttons (each option, or
  Submit, plus Cancel), wrapping from the last back to the first instead of leaving the dialog;
  **Shift+Tab** cycles backward. **ArrowLeft**/**ArrowRight** move focus the same way as
  Shift+Tab/Tab between those same buttons.
- Switching to (making visible) a tab that already has a pending question puts keyboard focus on
  **Cancel**, regardless of the question's kind — this is distinct from the "just opened" rule
  above, which is kind-dependent.

## Design decisions

**Not `useDialogKeyboard`/`dialogKeyHandler`.** Those are built for the *modal* dialogs
(`OverwriteConflictDialog`, `QuitDialog`) and register global capture-phase `keydown`/`click`
listeners that trap all input. `QuestionPanel` is explicitly non-modal
(`QuestionPanel.test.tsx` — "is non-modal and does not trap unrelated input"), so its Tab/arrow
handling must stay local: a plain `onKeyDown` on the button row only ever sees a keydown when
focus is already inside that row, and never touches clicks or keys elsewhere in the app.

**A small `useAnswerButtons` hook (new, `web/src/useAnswerButtons.ts`)** owns the roving-focus
group: given the button count and an initial index, it returns per-button `ref` callbacks and one
`onKeyDown` handler for the row, wrapping Tab/Shift+Tab/ArrowLeft/ArrowRight around the group.
Reused for both the approve (options + Cancel) and ask (Submit + Cancel) button rows so the two
variants don't duplicate the cycling logic.

**Initial per-question focus is keyed to `question.id`, not mount-once.** Because
`MountedViewLayers` renders `QuestionPanel` unkeyed (`current.pendingQuestion && <QuestionPanel
.../>`), switching between two tabs that both already have a pending question re-renders the same
component instance with a new `question` prop rather than remounting it. The kind-based initial
focus effect must depend on `question.id` so it reapplies to each new question, not just the
first one ever shown.

**Tab-switch refocus is a separate, higher-level concern**, wired the same way
`useFocusOnTabSwitch` already handles focusing the harness/shell terminal vs. the command line:
`QuestionPanel` exposes a `focusCancel()` imperative handle
(`forwardRef`/`useImperativeHandle`, matching `HarnessTab`/`ShellTab`/`EditorTab`'s existing
handle pattern); `App.tsx` holds a `questionPanelRef` and passes it through
`MountedViewLayers` down to `QuestionPanel`'s `ref`, and also into `useFocusOnTabSwitch`, which
calls `focusCancel()` instead of `focusCenterVisibleTab` when the newly active tab has a
`pendingQuestion`. Effect ordering makes this compose correctly without extra state: a child's
effects (QuestionPanel's own per-question focus) commit before its parent's
(`useFocusOnTabSwitch`, keyed on `activeTab`) on the same commit, so revealing a
previously-backgrounded tab's question runs the kind-based focus first and the tab-switch's
Cancel-focus second — Cancel wins, matching the spec. Switching among tabs without touching
`activeTab`'s question doesn't re-run the tab-switch effect, so the kind-based rule stands
undisturbed for a question that arrives while its own tab is already active.

## Implementation steps

1. **`web/src/useAnswerButtons.ts` (new)** — `useAnswerButtons(count: number, initialIndex:
   number)`: returns `{ getRef(i): (el) => void, onKeyDown(e) }`. `onKeyDown` handles
   `'Tab'`/`'ArrowRight'` (forward) and `'Shift+Tab'`/`'ArrowLeft'` (backward), wrapping
   `(index + dir + count) % count`, calling `preventDefault()` and focusing the target button.
2. **`web/src/QuestionPanel.tsx`** — convert to `forwardRef<QuestionPanelHandle, Properties>`;
   add a `cancelRef` for the Cancel button; wire `useAnswerButtons` for each branch (approve:
   `options.length + 1` buttons, initial index = last (Cancel); ask: 2 buttons \[Submit, Cancel\],
   initial index = last (Cancel) too, though the text input keeps the actual initial DOM focus via
   `autoFocus` — the roving group's "current index" only matters once focus enters the row).
   Attach `onKeyDown` to each button row's wrapping `div`. Add a `useEffect` keyed on
   `question.id` that focuses `cancelRef` when `question.kind === 'approve'` (the `ask` branch's
   `autoFocus` on the input already covers its case). Expose `useImperativeHandle(ref, () => ({
   focusCancel: () => cancelRef.current?.focus() }))`.
3. **`web/src/useFocusOnTabSwitch.ts`** — add a `questionPanelRef:
   React.RefObject<QuestionPanelHandle | null>` parameter to `useFocusOnTabSwitch`; inside the
   effect, if `currentRef.current?.pendingQuestion` is set, call
   `questionPanelRef.current?.focusCancel()` instead of `focusCenterVisibleTab(...)`.
4. **`web/src/MountedViewLayers.tsx`** — accept a `questionPanelRef` prop and pass it as the
   `ref` on `<QuestionPanel ref={questionPanelRef} .../>`.
5. **`web/src/App.tsx`** — create `const questionPanelRef = useRef<QuestionPanelHandle |
   null>(null)`, pass it to `useFocusOnTabSwitch(...)` and to `<MountedViewLayers
   questionPanelRef={questionPanelRef} .../>`.

## Tests

- **`web/src/useAnswerButtons.test.ts` (new)** — Tab/Shift+Tab/ArrowRight/ArrowLeft move focus to
  the expected next/previous button ref; wraps from last to first and first to last;
  `preventDefault()` is called; other keys are ignored (handler is a no-op, no `preventDefault`).
- **`web/src/QuestionPanel.test.tsx`** — add cases: an approve question focuses the Cancel button
  on render; an ask question still focuses the text input (existing behavior, re-asserted
  explicitly); pressing Tab in the approve button row cycles through option buttons and wraps to
  Cancel then back to the first option; ArrowLeft/ArrowRight move the same way; the existing
  "does not trap unrelated input" test keeps passing unmodified since the new handling isn't
  global. Add a case exercising `ref.current.focusCancel()` (via `createRef` +
  `useImperativeHandle`) moving focus to the Cancel button regardless of kind.
- **`web/src/useFocusOnTabSwitch.test.ts`** — add a case: when the switched-to tab has a
  `pendingQuestion`, the effect calls `questionPanelRef.current.focusCancel()` and does **not**
  call the harness/shell/command-line focus path.

## Verification

`./scripts/run.mjs check-diff` after each step.

## Out of scope

- Any change to `OverwriteConflictDialog`/`QuitDialog`/`useDialogKeyboard` — those dialogs are
  modal and already behave correctly; this plan only touches the non-modal question dialog.
- Persisting or restoring which button was last focused across an actual question
  answer/dismissal — a fresh question (or a fresh tab-switch) always recomputes initial focus per
  the rules above.
