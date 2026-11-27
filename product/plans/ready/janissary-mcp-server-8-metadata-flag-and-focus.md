# feat: show the MCP metadata flag and return focus after a question

**Complexity: 4/10** — ~60 added lines, 5 edited files, 4 requirements (p=5.06)

## Goal

Show a two-state MCP flag in a harness tab's metadata row, driven by the `mcp` and `mcpUsed` fields delivered by earlier subplans, and restore keyboard focus to the harness terminal when a question on the current harness tab resolves while focus was inside the panel. Both are purely presentational: the server owns the state; the client renders it.

Source: `./product/plans/complete/janissary-mcp-server.md`. Depends on `janissary-mcp-server-4-local-question-executor.md` and `janissary-mcp-server-7-harness-spawn-env.md`.

## Requirements

1. A harness tab launched with MCP config shows an MCP flag in its metadata row — user scope extra: "Metadata-row MCP icon".
2. The MCP flag has two states in `tabFlagDisplay`: plain `mcp` (tooltip "MCP server") from launch until the harness first calls the server, then green `mcpInUse` (tooltip "MCP server in use", `tab-flag--active`) for the rest of the tab's life — user answer: "Plain, green once used", the browser/browserInUse shape.
3. The MCP flag uses the `faServer` glyph, exported from `web/src/shared/icons.ts` beside the other flag icons — user answer: "faServer".
4. When the current harness tab's question resolves (answered, cancelled, or withdrawn) while keyboard focus is inside the panel, focus returns to that harness tab's terminal — user answer: "Escape/Cancel returns focus to the terminal." This is a new hook called from `web/src/App.tsx` beside `useFocusOnTabSwitch`.

## Design decisions

- `mcpFlag` sits beside `browserFlag` (`src/tab/view.ts:253`) in the same flag list, deriving `['mcpInUse']` when `tab.mcpUsed`, `['mcp']` when `tab.mcp`, and nothing otherwise. The server derives the state; the client only renders `flags`.
- The flag state mirrors browser/browserInUse: a tab keeps its `mcp` / `mcpInUse` state while a remote tab reconnects, and the existing connection plug shows the reconnect, so no new behavior is added there.
- Focus return is a new hook, not a change to `QuestionPanel`: when the current tab is a harness tab (`view === 'harness'`) and its `pendingQuestion` goes from present to absent while `document.activeElement` is `document.body` (the unmounted panel held focus), call the existing `focusCenterVisibleTab`, which focuses the terminal through `harnessHandles` keyed by `harness.ptyId`. Focus anywhere else at that moment, such as the other pane's command line, is left alone.
- The feature adds no key bindings.

## Preserved behavior

1. A question panel opening on a harness tab takes keyboard focus by the existing rule. Negative assertion: the new focus-return hook must not change which element receives focus when a panel opens. Test: `web/src/shared/questions/QuestionPanel.test.tsx` (existing focus assertions).

## Assumptions

1. `browserRunning` is the flag-state precedent on the harness view — `src/tab/types.ts:88` `browserRunning?: boolean;`.
2. The browser flag is derived server-side and added to the tab's flag list — `src/tab/view.ts:253` `function browserFlag(tab: Tab): string[]`.
3. Flag display is a plain keyed record of icon, label and optional class — `web/src/shared/tab/flag-display.ts:16` `export const tabFlagDisplay: Record<string,`.
4. The terminal focus helper already exists — `web/src/useFocusOnTabSwitch.ts:8` `export function focusCenterVisibleTab(`.
5. `App.tsx` already calls `useFocusOnTabSwitch` with `currentRef` and `harnessHandles` — `web/src/App.tsx:190` `useFocusOnTabSwitch(activeTab, currentRef, harnessHandles, inputReference, questionPanelRef, saveWalkOpenRef);`.

## Existing functionality

1. Metadata-row flag derivation with a launch/in-use pair — `src/tab/view.ts:253` `function browserFlag(tab: Tab): string[]`.
2. Metadata-row flag display registry — `web/src/shared/tab/flag-display.ts:16` `tabFlagDisplay`.
3. Shared icon registry — `web/src/shared/icons.ts:3` the `export { … } from '@fortawesome/free-solid-svg-icons'` block.
4. Central icon export — `web/src/shared/icons.ts:3` `export {`.
5. Terminal refocus helper for the current tab — `web/src/useFocusOnTabSwitch.ts:8` `export function focusCenterVisibleTab(`.
6. Non-modal question panel rendered for the current tab — `web/src/MountedViewLayers.tsx` `current?.pendingQuestion && <QuestionPanel`.

## Implementation steps

1. Add `mcpFlag` in `src/tab/view.ts` beside `browserFlag` (`src/tab/view.ts:253`) and include it in `tabFlags`, deriving `['mcpInUse']` when `tab.harness?.mcpUsed`, `['mcp']` when `tab.mcp`, otherwise nothing. Update the flag-name comment at `src/protocol/tab.ts:102` and `product/specs/tabs.md` § Metadata row. The file counts 187 lines toward `max-lines`, so the few added lines fit. Build and check with `$janissary/scripts/run.mjs check-diff`.
2. Export `faServer as mcpIcon` from the free-solid block in `web/src/shared/icons.ts`, and add `mcp: { icon: mcpIcon, label: 'MCP server' }` and `mcpInUse: { icon: mcpIcon, label: 'MCP server in use', className: 'tab-flag--active' }` to `tabFlagDisplay` (`web/src/shared/tab/flag-display.ts:16`). Build and check with `$janissary/scripts/run.mjs check-diff`.
3. Create `web/src/useQuestionFocusReturn.ts` with the hook described above: it watches the current tab's `pendingQuestion` transition and calls `focusCenterVisibleTab` only when the tab is a harness tab and focus is on `document.body`. Call it from `web/src/App.tsx` beside `useFocusOnTabSwitch` (`web/src/App.tsx:190`) with the same `currentRef` and `harnessHandles` arguments. Update `product/specs/agent-questions.md` with the focus-return behavior. Build and check with `$janissary/scripts/run.mjs check-diff`.

Every touched file stays under the 200-line `max-lines` limit; the hook is a new focused module. Relative imports in `src/` carry `.js`; web files follow the feature-directory and direct-import rules in `ai/guidelines/react-code-organization.md`.

## UI design

1. The flag is a new key in the existing metadata row, styled like browser/browserInUse, with the `faServer` glyph.
2. The panel is the existing non-modal `web/src/shared/questions/QuestionPanel.tsx`; opening focus is unchanged, and only the post-resolution return to the terminal is new.
3. The unread flag remains the existing tab-strip badge from `janissary-mcp-server-2-unread-for-every-question.md`.
4. No key bindings are added, and remote reconnect does not change the flag state.

## Tests

- `src/tab/view.test.ts`, beside the `browserInUse` cases: no flag without `tab.mcp`, `mcp` at launch, `mcpInUse` after use (requirements 1, 2).
- `web/src/useQuestionFocusReturn.test.ts`: a resolved question on the current harness tab focuses its terminal when focus was in the panel, and leaves focus alone when it is elsewhere (requirement 4). Keep `web/src/shared/questions/QuestionPanel.test.tsx`'s opening-focus assertions passing (preserved behavior 1).

## Out of scope

- Setting `tab.mcp` or `tab.mcpUsed`: earlier subplans own those fields.
- Changing the question panel's layout or controls.
- Any change to remote reconnect behavior.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then open a harness tab with MCP enabled: its metadata row shows the `MCP server` glyph; once the harness calls the tool the glyph turns green with the `MCP server in use` tooltip. Ask a question, then click Cancel while focus is in the panel and confirm focus lands back in the terminal; switch focus to the command line first and confirm it stays there. A failure is a flag that never turns green or focus that jumps away from the command line.
