# Single-select multiple-choice question

**Complexity: 8/10** — ~480 added production lines, 14 existing production files, 37 requirements and ~48 test scenarios (p=8.14).

## Goal

Let an agent present a single-choice list with a free-form alternative and receive one answer.

## Requirements

1. Provide `question choose "<question>" <option> [<option> …]` and a matching question-tool kind.
2. Render the labels as a radio-style single-answer list.
3. Always offer “Type your own answer” as an alternative to the listed options.
4. Return one value: the chosen label or the typed text.
5. Include command parsing, the agent primer, role and command inventory, protocol, panel keyboard navigation, and functional spec.
6. “Select a radio option, then press Submit.”
7. “Typing in the associated field automatically selects the alternative.”
8. “Keep the question open and disable Submit until a choice is selected.”
9. “Disable Submit until it contains non-whitespace text” when the free-form alternative is selected.
10. “Trim leading and trailing whitespace before returning it” for a typed answer.
11. “Reject the request as invalid and return usage or validation feedback” when option labels are duplicated.
12. “Reject exact matches only; retain labels that differ in case or whitespace.”
13. “Reject it as invalid, with usage or validation feedback” for a blank or whitespace-only option label.
14. “Reject it as invalid, with usage or validation feedback” for blank or whitespace-only question text.
15. “Reject it as invalid; at least one listed option is required.”
16. Include option descriptions alongside labels.
17. Include a caller-specified default selection.
18. Provide option descriptions through “both the question tool and the question choose command.”
19. Use a repeatable `--description` argument immediately after the option it describes in the command.
20. Allow a default selection through both the question tool and the `question choose` command.
21. Identify the default by its exact option label, using `--default` in the command.
22. Reject the request as invalid, with usage or validation feedback, if the default label does not exactly match an option.
23. “Preselect the default and enable Submit; the person may change it.”
24. Reject the exact option label “Type your own answer” as reserved.
25. Return updated usage text for malformed commands and a validation error for tool calls.
26. Support an `--option` flag to introduce any command option label explicitly, including labels matching flags.
27. Reject empty or whitespace-only option descriptions as invalid.
28. Keep typed alternative text while the question remains open when switching selections.
29. Label the submission button “Submit”.
30. Escape cancels all question types while focus is inside the panel and notifies the caller that the question is cancelled.
31. Escape returns the existing `Question cancelled.` result.
32. Place `--default` immediately after the question, before the option list.
33. Reject repeated `--default` or multiple `--description` arguments for one option and return usage text.
34. Return `Invalid choice question.` for invalid choice tool input.
35. Name the tool's default-label field `defaultOption`.
36. Grant `question choose` to built-in roles that currently have `question ask` or `question approve`.
37. Add the usage line `question choose "<question>" [--default <label>] <option> [--description <text>] ...` alongside the existing lines.

## Design decisions

- Use a native radio group with a fieldset and legend to associate the question with its choices and provide standard single-selection semantics. Reconcile its keyboard behavior with the existing panel navigation. Sources: https://www.w3.org/WAI/tutorials/forms/grouping/ and https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/radio_role.
- Extend the existing pending-question contract with structured choice options and an optional default. Add `'choose'` to `QuestionKind` (Assumption 2), add an exported `QuestionChoice` type (`label`, optional `description`) in `src/protocol/tab.ts`, and add two optional fields to `PendingQuestionView` and `QuestionRequest`: `choices` (the ordered `QuestionChoice` list, present only for `choose`) and `defaultOption` (the default label, present only when supplied). `options?: string[]` stays approve-only and is never set for `choose`, so no approve consumer changes.
- Validate choice requests through a shared server-side mechanism used by the command and question tool: `validateChoiceRequest`, in the one new shared module `src/shared/question-choice.ts`, which takes the question text, the candidate choice list, and the optional default and returns either the normalized `{ question, choices, defaultOption? }` or a failure. It rejects blank question text, an empty list, a blank label, the reserved label, an exact duplicate label, a present-but-blank description, and a default that is not exactly one of the labels. Labels and descriptions are kept verbatim; nothing is trimmed. The command maps every failure to `QUESTION_USAGE`. The tool maps every failure to `Invalid choice question.`. Neither surfaces the specific reason.
- The same module exports the reserved label as `CUSTOM_ANSWER_LABEL = 'Type your own answer'`. The validator and the web panel share that one constant, and the web imports it as `@shared/shared/question-choice`, the way `web/src/shared/command-availability.ts` imports `@shared/shared/command-matching` (Existing functionality 12). The validator is pure and imports nothing server-only, so the client bundle can import the module safely. There is no separate server-only validator file.
- Keep the string-only answer RPC and accept any nonblank string for choice questions. In `Questions.answer`, a `choose` answer is accepted when `answer.trim() !== ''` and refused (returns `false`, question stays open) otherwise. The server does not trim or check it against the labels. The client trims typed text before sending, and sends listed labels verbatim.
- The choice tool accepts an array of objects with a label and optional description. The objects go in the existing `options` field when `kind` is `choose`; `options` stays a string list for `approve`. A bare string element in a `choose` call is invalid. Extra keys on an option object are ignored. `defaultOption` is ignored for `ask` and `approve`.
- Ensure MCP schema validation and both local and remote call paths return `Invalid choice question.` for invalid choice inputs, including inputs rejected before registration. Two zod changes in `questionInputSchema` make this work. First, `options` becomes `z.unknown().optional()`, so a malformed choice list gets past the SDK's own type check and reaches `validateQuestionArgs` (Assumption 4). Second, `defaultOption` is added as `z.unknown().optional()`, because `z.object` strips undeclared keys before the handler sees them (Assumption 5). `tab`, `kind`, and `question` keep their `z.string()` schema: a non-string value for one of those still gets the SDK's own schema error for every kind, including `choose`. Once `kind` is `choose`, `validateQuestionArgs` hands the call to `validateChoiceRequest` before it runs its own `emptyQuestion` check, so a blank question on a choice call also returns `Invalid choice question.`. With `options` loosened, a malformed approve `options` sent through the local HTTP endpoint now gets `options must be a list of strings.` too, which is what the relay already returns (Assumption 6).
- Update `QUESTION_ERROR.invalidKind` to `kind must be "ask", "approve", or "choose".` and add `QUESTION_ERROR.invalidChoice` = `Invalid choice question.`.
- Update the `question` tool description in `src/mcp/tools.ts` to spell out the `choose` shape: `options` is a list of `{label, description?}` objects, `defaultOption` is an exact label, and the answer is the chosen label or the person's typed text. With `options` typed `unknown`, the advertised JSON schema no longer describes this shape, so the description has to.
- Command grammar, decided against the existing tokenizer `words` in `src/question-command.ts` (Assumption 7). The tokenizer drops quoting, so quoting a flag does not escape it: `"--default"` is the flag `--default`. `--option` is the only way to pass a label that looks like a flag. The token right after `--default`, `--description`, or `--option` is always taken literally as that flag's value, even when it starts with `--`. Any other bare token starting with `--` (for example `--foo`) is usage, never a label. A missing flag value is usage. `--default` is valid only as the token right after the question; `--default` anywhere else, or a second `--default`, is usage. `--description` before any option, or a second `--description` for the same option, is usage. The grammar lives in a `parseChooseCommand(tokens)` function in `src/question-command.ts` beside `parseQuestionCommand`, which calls it when `tokens[1]` is `choose`. It turns the tokens after `question choose` into `{ kind: 'choose', question, choices, defaultOption? }` via `validateChoiceRequest`, or into `{ error: QUESTION_USAGE }`. The file is 67 lines today, so the parser fits. Extract it to its own module only if the file would pass the 200-line limit.
- Use the existing `useAnswerButtons` behavior for the existing forms; use native radio behavior for the choice group. The choice form does not use `useAnswerButtons` at all, because its Tab handling wraps inside a single button row and would trap Tab between Submit and Cancel. ArrowLeft and ArrowRight on the choice form's Submit and Cancel get no special handling. Use standard string trimming for custom answers and add no dependency.
- Selection and custom text are view-local state in the choice form. The form is keyed by `question.id`, so a different question starts fresh. Leaving the tab unmounts or re-keys the centre panel (Assumption 11), so returning to a tab with a pending choice question restores the default selection (or no selection) and clears the typed text. Server state is unchanged, because the server holds no selection. This is a deliberate cut: the ceiling is that a half-made choice is lost on a tab switch. The upgrade path is to lift the selection and text into a per-question map in `MountedViewLayers`, keyed by question id.
- Because state resets on return, the return focus of UI design 10 is the same as the open focus of UI design 3: Submit when there is a default, otherwise the first choice. So tab-switch focus needs no new handle method. `useFocusOnTabSwitch` still returns early for any pending question, but calls `focusCancel()` only when the kind is not `choose`. The choice form's own focus-on-mount effect does the rest. `QuestionPanelHandle` and its existing test stubs stay unchanged.
- Size and place every question panel inside a layer that covers the owning tab's view, and compute the panel's equal percentage in JavaScript. CSS alone cannot find the smallest percentage at which wrapped content fits. See Implementation step 1 and UI design 7–9 and 14–18.

## Preserved behavior

1. `ask` returns the typed answer and must not return a different value; `web/src/shared/questions/QuestionPanel.test.tsx` “renders a text input and sends the typed answer”.
2. `approve` returns the selected label and must not submit a different label; `web/src/shared/questions/QuestionPanel.test.tsx` “renders approve options and sends the chosen label”.
3. Cancel returns the cancellation result and must not submit an answer; `src/questions.test.ts` “reports cancellation to the waiting agent”.
4. A second question on the same tab waits and must not replace the active question; `src/questions.test.ts` “holds a second question until the first resolves”.
5. Closing a tab resolves active and queued questions and must not leave callers waiting; `src/questions.test.ts` “resolves active and queued questions when their tab closes”.
6. The question panel remains non-modal and must not trap unrelated input; `web/src/shared/questions/QuestionPanel.test.tsx` “is non-modal and does not trap unrelated input”.
7. Existing answer-button keyboard navigation wraps and must not leave the panel's button sequence unexpectedly; `web/src/shared/questions/QuestionPanel.test.tsx` “cycles Tab and ArrowLeft/ArrowRight between the answer buttons, wrapping around”.
8. `ask` initially focuses its text input and must not focus Cancel instead; `web/src/shared/questions/QuestionPanel.test.tsx` “focuses the text input on render for an ask question”.
9. `approve` initially focuses Cancel and must not focus an option instead; `web/src/shared/questions/QuestionPanel.test.tsx` “focuses Cancel on render for an approve question”.
10. Switching to a tab with a pending `ask` or `approve` question focuses that panel's Cancel and must not focus the terminal or command line; `web/src/useFocusOnTabSwitch.test.ts` “focuses the question dialog Cancel button instead when the active tab has a pending question”.
11. Shift+Tab inside an existing panel stays in the panel and must not cycle application sections; `web/src/useSectionNav.question.test.tsx` “moves from Cancel to the last option instead of cycling sections”.
12. Server-side approve validation refuses a label that was not offered and must not resolve the question with it; `src/commands/question.test.ts` “registers a pending approve question validated against the supplied options”.
13. When a focused panel's question resolves, focus returns to the harness terminal and must not stay on the body; `web/src/useQuestionFocusReturn.test.tsx` “focuses the same harness terminal when its focused question panel goes away”.
14. A docked plugin tab's question routes its answer to its own tab and must not route to the centre tab; `web/src/plugins/PluginBody.test.tsx` “routes free text, approval and Cancel to the %s dock owner”.
15. A relayed remote call with invalid arguments opens no panel and must not claim its call id; `src/remote/mcp-relay.test.ts` “refuses $label without registering and lets a later valid call with the same id register”. That test's `an unknown kind` row changes its expected text to the new `invalidKind` wording.

## Assumptions

1. `src/questions.ts:25` declares `register` with a `Promise<string>` result: `register(request: QuestionRequest, signal?: AbortSignal, onWithdraw?: () => void): Promise<string>`.
2. `src/protocol/tab.ts:65` declares the kind union as `export type QuestionKind = 'ask' | 'approve';`, and `PendingQuestionView` (line 66) carries only `id`, `tab`, `kind`, `question`, and `options?: string[]`.
3. `src/questions.ts:61` validates approve answers server-side: `if (answer !== null && entry.kind === 'approve' && !entry.options?.includes(answer)) return false;`.
4. `src/mcp/tools.ts:15` types the tool's options as `options: z.array(z.string()).optional()`, so an object element is rejected by the SDK before `validateQuestionArgs` runs.
5. `src/mcp/tools.ts:11` builds the tool schema with `z.object({ tab, kind, question, options })` and declares no `defaultOption` key.
6. `src/remote/mcp-relay.ts:20` validates relayed calls with `validateQuestionArgs(args as Record<string, unknown>)` on raw JSON, with no zod pass.
7. `src/question-command.ts:17` tokenizes with `words`, which returns unquoted strings (`match[1] … ?? match[2] ?? match[3]`) and keeps no record of which tokens were quoted.
8. `src/mcp/executor.ts:21` destructures only `{ tab: requested, kind, question, options }` from the args and passes `{ tab: label, kind, question, options }` to `register` (line 28).
9. `web/src/useFocusOnTabSwitch.ts:34` focuses Cancel for every pending question: `if (currentRef.current?.pendingQuestion) { questionPanelRef.current?.focusCancel(); return; }`.
10. `web/src/shared/tab/handles.ts:13` declares `export type QuestionPanelHandle = { focusCancel(): void };`.
11. `web/src/MountedViewLayers.tsx:154` mounts the centre panel only for the current tab: `{current?.pendingQuestion && ( <QuestionPanel ref={questionPanelRef} …`.
12. `web/src/MountedViewLayers.tsx:154` renders the panel as a direct child of the `.center-action-area` grid. `MountedViewLayers` returns a fragment, which `web/src/CenterActionArea.tsx:99` places as `{persistentLayers}` inside the `center-action-area` div.
13. `web/src/theme.css:189` makes `.center-action-area` a positioned grid with `grid-template-rows: auto minmax(0, 1fr)`: row 1 is the tab strip and row 2 is the tab bodies.
14. `web/src/plugins/PluginTabLayer.tsx:45` places a centre plugin body in its pane's column with `gridColumn: tab.pane === 'right' ? 2 : 1`.
15. `web/src/theme.css:691` currently pins the panel top-right with a fixed width: `.question-panel { position: absolute; z-index: 50; top: 44px; right: 14px; width: min(420px, calc(100% - 28px)); }`.
16. `web/src/plugins/PluginBody.tsx:173` renders a docked tab's panel with no ref: `{dock !== null && active && pendingQuestion && <QuestionPanel question={pendingQuestion} client={client} />}`.
17. `web/src/theme.css:814` declares `.sidebar-plugin { flex: 1; min-height: 0; flex-direction: column; }` with no `position`, and no sidebar ancestor is positioned (`.sidebar`, `.sidebar-body` at lines 806–807), so a docked panel's absolute box resolves against the viewport today.
18. `web/src/useSectionNav.ts:71` stands down for keys inside `[data-claims-shift-tab]`: `if (e.defaultPrevented || keyboardCapturedRef.current || claimsShiftTab(e.target)) return;`.
19. `web/src/shared/ModalDialog.tsx:11` takes only `dialogRef`, `title`, `children`, `modal`, and `className`, with no key handler prop.
20. jsdom has no `ResizeObserver`: `web/src/App.test.tsx:105` stubs it (`vi.stubGlobal('ResizeObserver', …)`), and `QuestionPanel.test.tsx`, `useSectionNav.question.test.tsx`, `useQuestionFocusReturn.test.tsx`, and `PluginBody.test.tsx` mount the panel without a stub.
21. `src/plugins/roles/shared.ts:3` lists native agent commands in `NATIVE_ACP_COMMANDS`, with `'question ask'` and `'question approve'` at lines 11–12.
22. `src/plugins/roles/roles-file.test.ts:102` pins inventory counts: `expect(file['ask'].commands).toHaveLength(18)`, `file['tell'].commands` length 25, `file['tell'].commands` equal to `NATIVE_ACP_COMMANDS` minus `tab` in order, and `NATIVE_ACP_COMMANDS` length 26. The `ask` count of 18 is asserted again at line 125.
23. `src/plugins/roles/default-roles.ts:47` (role `ask`) and `:63` (role `tell`) are the only built-in roles granting `'question ask', 'question approve'`.
24. `src/question-command.test.ts:56` pins the primer's example count: `expect(QUESTION_PRIMER.split('\n').filter((line) => line === '```janissary')).toHaveLength(2);`.
25. `src/mcp/question-tool.test.ts:7` and `src/remote/mcp-relay.test.ts:234` assert the literal `'kind must be "ask" or "approve".'`.
26. `src/agent/command-tools.ts:37` gates every `question` entry on the `ask-user` skill: `if (entry.name === 'question' && snapshot.skills.every(({ name }) => name !== 'ask-user'))`. `question choose` inherits that gate without change.
27. `product/specs/agent-questions.md:47` states `There is no timeout or caller-supplied default.`, and line 29 states that tab-switch focus goes to Cancel “regardless of whether the question is a free-text or approval question”.

## Existing functionality

1. `src/question-command.ts:29` defines `parseQuestionCommand` for existing question commands.
2. `src/questions.ts:46` defines `pendingFor` for the tab's pending question.
3. `web/src/shared/questions/QuestionPanel.tsx:41` renders the non-modal `ModalDialog`.
4. `product/specs/agent-questions.md:41` specifies “one pending question at a time” per tab.
5. `src/mcp/question-tool.ts:28` defines `validateQuestionArgs`, used by both `src/mcp/handler.ts:22` and `src/remote/mcp-relay.ts:20`. Extending it covers the local HTTP, far-side, and relay paths with no edit to `handler.ts` or `mcp-relay.ts`.
6. `src/protocol/core-rpc.ts:34` defines `answerQuestion` with a string or null answer: `{ method: 'answerQuestion'; params: { tab: string; id: string; answer: string | null } }`. `src/client-params/core.ts:33` already accepts any string, so the RPC needs no change.
7. `web/src/useFocusOnTabSwitch.ts:34` calls `focusCancel` for pending questions.
8. `web/src/shared/questions/useAnswerButtons.ts:12` defines `useAnswerButtons` for existing answer-button navigation.
9. `src/questions.ts:3` defines `QUESTION_CANCELLED = 'Question cancelled.'`, the result Escape returns through the existing `respond(null)` path in `QuestionPanel`.
10. `src/commands/forms.ts:27` declares the command inventory row `question: { name: 'question', forms: ['question ask', 'question approve'] }`.
11. `src/commands/question.ts:29` and `src/question-command.ts:42` hold the two `^question\s+(ask|approve)\b` matchers (command dispatch and ACP reply-line detection), and `src/commands/question.ts:30` holds the dispatch `samples` that `src/commands.test.ts` checks for shadowing.
12. `web/src/shared/command-availability.ts:2` imports a runtime value from `src/shared/` as `@shared/shared/command-matching`. That's the precedent for sharing `CUSTOM_ANSWER_LABEL`.
13. `web/src/plugins/pdf/usePdfStageViewport.ts:33` observes a container with `new ResizeObserver(measure)`. That's the pattern for re-fitting the panel when the tab view resizes.

## Implementation steps

Land three checkpoints in this order. Each one leaves the tree green. Every checkpoint's build command, and the check that proves it green, is `$janissary/scripts/run.mjs check-diff`. Use `.js` relative imports in `src/`. If a file would exceed 200 lines, extract a cohesive module rather than compacting it.

**Checkpoint 1 — panel placement, sizing, and Escape for the existing kinds.** No protocol change.
- In `web/src/shared/questions/QuestionPanel.tsx`, wrap the panel in a new layer element `question-panel-layer`. The layer covers the owning tab's view and centers the panel; `pointer-events: none` on the layer and `pointer-events: auto` on the panel keep the panel non-modal (Preserved 6).
- Inside `ModalDialog`, split the panel's children into a scrolling body (question text, plus the choice group from checkpoint 2) and a fixed footer. For `ask` the footer is the existing form's input and its Submit/Cancel row. For `approve` it is the existing option-and-Cancel row. The DOM order and `useAnswerButtons` wiring of both stay the same.
- Handle Escape with an `onKeyDown` on the panel's own content wrapper inside `ModalDialog` (Assumption 19), not by changing `ModalDialog`. It calls the existing `respond(null)`, `preventDefault`, and `stopPropagation`, so window-level Escape listeners in plugin tabs don't also act.
- For centre tabs, `MountedViewLayers` passes the current tab's pane to `QuestionPanel` as a new optional `pane` prop. The layer places itself with `grid-row: 2` and the same column rule as `PluginTabLayer` (Assumption 14), so it covers exactly that tab's body below the tab strip.
- Docked panels have no grid around them. Give `.sidebar-plugin` `position: relative` (Assumption 17), and the layer fills it with `inset: 0`, so a docked panel centers in its own docked body instead of the viewport.
- Replace the top-right/420px rule (Assumption 15) with the layer rules and the fitted-size rules in `web/src/theme.css`. Keep the `modal` and `modal-button` look.
- Put the size search in a new pure module, `web/src/shared/questions/panel-fit.ts`, exporting `fitPanelPercent`. Given the layer's width and height and a function that reports the panel's content height at a given width, it returns the smallest whole percentage from 1 to 90 at which the content height is no more than that percentage of the layer's height, or 90 when none fits.
- Put the DOM side in a new hook, `web/src/shared/questions/useQuestionPanelFit.ts`. It measures in a layout effect: it sets a candidate width and reads the panel's `scrollHeight`. It sets the panel's width and height to the chosen percentage. It re-runs on `question.id` changes and when the layer resizes, through a `ResizeObserver` like `usePdfStageViewport` (Existing functionality 13). When `ResizeObserver` is undefined it measures once and skips observing (Assumption 20), so existing tests need no stub.
- Overflow, decided per UI design 8, 16, and 18. At 90%, the body scrolls and the footer stays visible. When 90% of the layer's height is shorter than the title plus footer, the panel's height grows to that fixed height. When the fixed height exceeds the layer, the panel is capped at the layer's size and the whole panel scrolls.

**Checkpoint 2 — protocol types and the client choice form.** The server produces no `choose` question yet.
- Add `'choose'`, `QuestionChoice`, `choices`, and `defaultOption` to `src/protocol/tab.ts` per the design decisions.
- Add `src/shared/question-choice.ts` with `CUSTOM_ANSWER_LABEL` only. `validateChoiceRequest` joins it in checkpoint 3.
- Add `web/src/shared/questions/ChoiceQuestionForm.tsx`, a plain component. It renders the fieldset/legend radio group, the custom field, and the Submit/Cancel footer, and owns the selection and custom-text state. The answer it would send is derived inline from that state, with no separate module: a selected listed label verbatim, or the custom text with `String.prototype.trim` applied. The answer is absent when nothing is selected or the trimmed text is empty, and Submit is `disabled` while the answer is absent. On mount it focuses Submit when there is a default, otherwise the first listed radio. Mark its form `data-claims-shift-tab` (Assumption 18) so `useSectionNav` stands down inside it.
- Tab wrapping: Tab from Cancel focuses the group's current stop (the checked radio, or the first radio when none is checked). Shift+Tab from any radio focuses Cancel. Every other Tab press is native, so a disabled Submit is skipped.
- Enter in the custom field uses the browser's native implicit form submission. The browser already blocks that while the form's submit button is `disabled`. Enter on a radio calls the form's native `requestSubmit()`, because browsers differ on whether a radio submits implicitly. The form's `onSubmit` ignores an absent answer, so neither path can send a blank answer.
- Typing in the custom field selects the custom radio. Typed text is kept when the selection moves to a listed choice and back (requirement 28).
- Focus moves from the custom radio to its text field only on a Space `keyup` on that radio, or on a pointer click on the radio or its label (a `click` with `detail > 0`). Browsers also fire `click` (with `detail` 0) when arrow keys select a radio, so a plain click handler can't tell the two apart. Arrow-key selection keeps focus in the group.
- In `QuestionPanel`, render `ChoiceQuestionForm` with `key={question.id}` when `question.kind === 'choose'`. Today the non-`ask` branch renders approve buttons; it becomes an explicit `approve` branch.
- In `useFocusOnTabSwitch` (Assumption 9), skip the `focusCancel()` call when the pending question's kind is `choose`, but still return early. The choice form's mount focus then stands, as the design decision on return focus describes. `QuestionPanelHandle` is unchanged.
- Docked panels (Assumption 16) keep their kind-based focus on open. They take no part in tab-switch focus, which is unchanged.

**Checkpoint 3 — server validation, command, tool, inventory, and docs.**
- Add `validateChoiceRequest` to `src/shared/question-choice.ts`, and `parseChooseCommand` to `src/question-command.ts`, per the design decisions.
- `parseQuestionCommand` delegates `choose` to `parseChooseCommand`.
- Add the usage line from requirement 37 as the third line of `QUESTION_USAGE`.
- Add a `question choose "<question>" [--default <label>] <option> [--description <text>] ...` syntax line to `QUESTION_PRIMER`, plus one `commandExample` for `choose` that uses `--default` and `--description`.
- Extend both matchers (Existing functionality 11) to `(ask|approve|choose)`, and add a `question choose 1` sample.
- Add `'question choose'` to the `question` row's forms in `src/commands/forms.ts`.
- Insert `'question choose'` right after `'question approve'` in `NATIVE_ACP_COMMANDS` and in both role lists in `src/plugins/roles/default-roles.ts`, keeping the order identical so the `tell` equals-`NATIVE_ACP_COMMANDS`-minus-`tab` assertion holds (Assumption 22).
- In `src/questions.ts`, carry `choices` and `defaultOption` through `QuestionRequest`, `pendingFor`, and the queued entry. Add the nonblank `choose` check beside the approve check in `answer` (Assumption 3).
- In `src/mcp/question-tool.ts`, add `choices?` and `defaultOption?` to `QuestionArgs`, accept `choose` in the kind check, and delegate a `choose` call to `validateChoiceRequest` as described.
- In `src/mcp/tools.ts`, apply the schema and description changes.
- In `src/mcp/executor.ts`, pass `choices` and `defaultOption` into `register` (Assumption 8).
- Update the tests that pin the old strings and counts: Assumption 22 becomes 19/26/27, Assumption 24 becomes 3, and Assumption 25 uses the new `invalidKind` text.
- Add a `question choose` section to `skills/ask-user/SKILL.md`, and mention `question choose` in its `description` front matter.
- Update `help/question.md` (usage, use case, example), and add a `question choose` row after `question ask` in `help/commands.md`.
- Update the specs:
  - `product/specs/agent-questions.md`: commands, panel, keyboard (including Escape and the `choose` exception to Cancel-on-tab-switch), and replace the “no caller-supplied default” sentence (Assumption 27).
  - `product/specs/mcp-server.md`: the tool's `choose` kind, `defaultOption`, `Invalid choice question.`, and the loosened `options` type check in the local and relay paragraphs.
  - `product/specs/roles.md`: the default `ask` role command list.
  - `product/specs/application-commands.md`: the per-form rows sentence, which gains `question choose`.
  - `product/specs/keyboard-navigation.md`: the question-panel Shift+Tab exception, which now covers the choice form.

## UI design

1. The existing `QuestionPanel` displays the question on its owning tab, using the existing question panel surface.
2. Stack radio options vertically, with each description beneath its label, followed by the custom answer and Submit/Cancel controls. The custom alternative is the last radio in the same group, labelled “Type your own answer”, with its text field directly beneath it. The field is always enabled and always a tab stop.
3. On opening, focus the first choice if there is no default; otherwise focus Submit.
4. Use standard radio behavior: arrow keys move and select choices, Space selects, and Tab moves to the next control.
5. Tab and Shift+Tab wrap within the choice form, matching existing question-panel controls. The tab order is the radio group, then the custom field, then Submit (skipped while disabled), then Cancel, then back to the radio group.
6. Escape cancels any question type while focus is inside its panel.
7. Keep the panel at the same percentage of tab width and tab height, up to 90% each, wrapping text as necessary. For a centre tab, “tab” means the current tab's body area: its pane column, below the tab strip. For a docked tab, it means that tab's docked body.
8. At the size limit, scroll the content inside the panel while keeping Submit and Cancel visible. The title stays fixed at the top. The question text and, for `choose`, the radio group and custom field scroll. The footer stays fixed: Submit/Cancel for `choose`, the input plus Submit/Cancel for `ask`, and the option-and-Cancel row for `approve`.
9. Apply equal-percentage sizing and scrolling to all question types.
10. On returning to a tab with a pending choice question, focus Submit if enabled, otherwise the first choice. Because selection is view-local and resets on return, Submit is enabled on return exactly when the question has a default.
11. Name the custom field “Type your own answer” for assistive technology and name the radio group by the question.
12. Match the existing `QuestionPanel` and `modal-button` theme conventions.
13. Explicitly activating the custom-answer radio with Space or a click moves focus to its text field; arrow selection keeps focus in the radio group.
14. Start at the smallest equal percentage of tab width and height that fits the content, up to 90%.
15. Center the panel in the tab view.
16. If the tab is too small to fit the fixed controls within 90%, let the panel exceed that limit so the controls remain visible.
17. Keep shared question presentation in `web/src/shared/questions/`, with server-owned question state projected to the client and only view-local selection and focus state held in the client.
18. If the tab is smaller than the controls even after exceeding 90%, constrain the panel to the tab and allow its entire contents, including controls, to scroll.
19. Enter on a choice or in the custom-answer field submits the current valid answer; it does nothing while Submit is disabled.

## Tests

- `src/question-command.test.ts`: requirements 1, 11–15, 19, 21–22, 24, 26–27, 32–33, and 37.
  - Choose parsing with and without `--default`.
  - `--description` attached to the preceding option.
  - `--option --default` producing a literal label.
  - A quoted `"--default"` acting as the flag.
  - An unknown `--foo` token returning usage.
  - Each invalid form returning `QUESTION_USAGE`.
  - Labels differing only in case or whitespace being retained.
  - `QUESTION_USAGE` containing the new line.
  - The primer example count rising to 3.
- `src/shared/question-choice.test.ts` (new): each `validateChoiceRequest` acceptance and rejection rule from the design decisions.
- `src/mcp/question-tool.test.ts`: requirements 18, 20, 22, 24, 27, and 34–35.
  - A valid `choose` call with objects and `defaultOption`.
  - Each invalid choice input, including a bare-string element, a non-array `options`, a blank question, and a non-string `defaultOption`, returning `Invalid choice question.`.
  - The new `invalidKind` text.
- `src/mcp/handler.test.ts`:
  - A row asserting that `questionInputSchema` accepts an `options` list of objects and keeps `defaultOption`, by parsing with the schema directly. The existing `registerTool` mock does not run zod.
  - A `choose` row for an invalid choice call mapping to `Invalid choice question.`.
- `src/remote/mcp-relay.test.ts`: requirement 34 on the relay path. Add a `choose` row with an invalid option object to the existing “refuses $label …” table.
- `src/mcp/executor.test.ts`: `choices` and `defaultOption` reaching `register`.
- `src/questions.test.ts`: requirements 4 and 10 on the server.
  - `pendingFor` projecting `choices` and `defaultOption`.
  - A `choose` answer that is blank or whitespace-only being refused while the question stays open.
  - Any nonblank string, including one that is not a label, being accepted.
- `src/commands/question.test.ts`: `command.match` accepting `question choose`, and a `choose` command registering a pending choice question.
- `src/application-commands.test.ts` and `src/plugins/roles/roles-file.test.ts`: requirements 5 and 36. The `question choose` native row has `nativeTool` `question`, and the updated counts hold.
- `web/src/shared/questions/panel-fit.test.ts` (new): UI design 14. The smallest fitting percentage, the 90% cap, and a monotone height function.
- `web/src/shared/questions/QuestionPanel.test.tsx`: requirements 2–4, 6–10, 16–17, 23, and 28–31, and UI design 2–6, 11, 13, and 19.
  - Default preselected with Submit focused.
  - First choice focused without a default.
  - Typing selects the alternative.
  - Typed text kept across selection changes.
  - Trimmed text sent.
  - Disabled Submit and Enter doing nothing.
  - Tab and Shift+Tab wrapping.
  - Space or click on the custom radio moving focus to the field, while an arrow keeps it in the group.
  - Escape sending `null` for `ask`, `approve`, and `choose`.
- `web/src/useSectionNav.question.test.tsx`: Shift+Tab on a choice radio staying in the panel.
- `web/src/useFocusOnTabSwitch.test.ts`: UI design 10. For a `choose` question, neither `focusCancel` nor the centre focus is called. `focusCancel` is still called for `approve`.
- `web/src/shared/questions/QuestionPanel.test.tsx` also covers UI design 10 end to end. It unmounts and remounts a panel for a pending choice question with a default and asserts that Submit is focused. Without a default, it asserts that the first choice is focused.
- The overflow layout of UI design 7–9, 15–16, and 18 depends on real layout that jsdom cannot measure. `panel-fit.test.ts` covers the computation, and the Verification section's manual check covers the rendering.
- Keep the named preservation tests passing.

## Out of scope

- Multiple selections and a caller-specified answer-length limit.
- Migrating existing user or project roles files: roles saved before this change do not gain `question choose` automatically.
- Persisting a choice panel's selection or typed text across tab switches or reloads.
- Changing the SDK's own schema error for a non-string `tab`, `kind`, or `question`.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then, in the running app:

1. Issue `question choose "Release?" --default stable stable --description "Stable release" beta` on a tab's command line.
2. Verify the panel is centered in the tab body, stable is selected with “Stable release” beneath it, and Submit has focus.
3. Submit, and verify the command's entry finishes with `stable`.
4. Issue it again. Arrow down to the “Type your own answer” radio and confirm focus stays in the group. Press Space and confirm focus moves to the field. Type `  nightly  `, then submit, and verify the result is `nightly`.
5. Issue it a third time and press Escape. Verify the result is `Question cancelled.`.
6. Issue `question ask "Port?"` and press Escape with focus in the field. Verify it also returns `Question cancelled.`.
7. Issue `question choose "Release?" stable stable` and verify usage text is returned and no panel opens.
8. Shrink the window until the panel reaches 90%. Verify the question text scrolls while Submit and Cancel stay visible.

A missing or off-center panel, a wrong value, wrong focus, a panel opening for the duplicate-label command, or hidden Submit/Cancel controls is a failure.
