# Shared find overlay support for the PDF tab

**Complexity: 3/10** — one shared component gains three optional props, one key branch, and one status branch, plus its tests and two spec paragraphs. The number comes from the regression surface: the editor and shell overlays share the component and must keep rendering and behaving exactly as they do today.

## Goal

Make `LineFind` ready to be the PDF tab's find overlay. The input gets an accessible name equal to its placeholder, `Cmd+F` inside the input selects the whole query instead of reaching the browser, and callers can attach an input ref, replace the line-number label, and show a muted status line. Record the shared key and name behavior in the editor and shell specs.

## Design decisions and dependencies

This subplan depends on nothing earlier and must land before `pdf-find-03-find-hook-and-overlay`, which consumes the new props and cannot typecheck until they exist. `pdf-find-05-specs-docs-and-verification` documents the final PDF behavior afterwards. `useLineFind` and `rankedOverlayKeys` stay unchanged, and no CSS change is needed.

- The accessible name is `aria-label={placeholder}` on the input at `web/src/shared/line-find/LineFind.tsx:64`. The placeholder attribute stays, so `getByPlaceholderText` keeps working, and every caller gets a name with no new prop: `Search buffer` (`EditorTab.tsx:201`), `Search transcript` (`ShellTab.tsx:226`), and later `Search document`. No visible label is added.
- The key handler becomes a small wrapper around the handler `rankedOverlayKeys` returns (`LineFind.tsx:56`). The wrapper checks for `Cmd+F` first and passes every other key to that handler unchanged, so today's Up/Down/Enter/Escape behavior and its `stopPropagation` for every key (`ranked-overlay-keys.ts:21`) are untouched. The check is meta and `f` with no other modifier (`metaKey`, not `ctrlKey`, not `altKey`, not `shiftKey`, and `key.toLowerCase() === 'f'`, so a capital `F` from Caps Lock still matches). It calls `preventDefault`, calls `stopPropagation`, and selects the whole input through `event.currentTarget.select()`, whether the query is empty or not.
- `preventDefault` keeps the browser's find bar from opening. `stopPropagation` keeps the window key handler (`web/src/useWindowKeys.ts:200`, a bubble-phase listener) from seeing the key; in the shell, that handler would otherwise run the claimed `meta+f` chord and call `openFind('')` (`ShellTab.tsx:160`), clearing the query the second `Cmd+F` was meant to select. `rankedOverlayKeys` stays as it is because quick-open shares it (`web/src/pickers/QuickOpen.tsx:45`) and has no find chord.
- `inputRef` is an optional `React.RefObject<HTMLInputElement | null>`, the repo's existing optional-ref type (as on `web/src/shared/command-bar/CommandBarShell.tsx:12`). It is attached to the input beside `autoFocus` and changes nothing on its own. The PDF hook uses it to focus the input and select its query when `Cmd+F` arrives while the overlay is open but focus has moved outside it.
- `rowLabel` is an optional `(result: FuzzyMatchResult) => React.ReactNode`. When it is absent a row shows `result.index + 1`, exactly as today (`LineFind.tsx:37`). When it is present, `LineFind` keeps the existing dimmed `.editor-find-line` span and renders the returned node inside it, so the PDF's 1-based page number lands in that column with no new markup or CSS. The fallback applies only to an absent prop: a `rowLabel` that returns null renders an empty label rather than the line number. The row text keeps the existing `.editor-find-text` clipping and ellipsis (`theme.css:631`), so a long line is not wrapped.
- `status` is an optional string, rendered only when it is non-empty and the trimmed query is non-empty. It is a `picker-row picker-empty` line — the muted style `type to search` and `No matching lines` already use (`theme.css:588`) — inside the overlay body, after the rows when there are results and in their place when there are none. It scrolls with the rows under `.picker`'s `overflow-y: auto` (`theme.css:574`); do not make it sticky. An empty query still shows only the `type to search` hint, so the status is not shown there. The PDF uses it for `Reading pages…`; the editor and shell pass nothing and gain no line.
- The editor and shell call sites do not pass any of the three props (`EditorTab.tsx:200`, `ShellTab.tsx:225`). Their only behavior change is the shared one the source plan asks for: `Cmd+F` inside the open overlay selects the query, and the input's accessible name equals its placeholder. Their existing find tests query by placeholder (`EditorTab.test.tsx:1408`, `ShellTab.test.tsx:1704`), which still matches because the placeholder attribute stays.
- `product/specs/editor-tab.md:470` § Finding a line and `product/specs/shell-tab.md:233` § Transcript search each gain one sentence for `Cmd+F` inside the open overlay selecting the query, and one clause naming the input by its placeholder:
  - Editor: in the first paragraph, after "The browser's own find bar never appears.", add "Pressing Cmd+F again while the overlay is open selects the whole query, so typing replaces it." Change the phrase `labelled "Search buffer"` (`editor-tab.md:472`) to `whose placeholder, also its accessible name, is "Search buffer"`.
  - Shell: in the first paragraph, after the sentence ending "... returns the keyboard to the command bar." (`shell-tab.md:235`), add "Pressing `Cmd+F` again while the overlay is open selects the whole query, so typing replaces it, and the browser's find bar does not open." Change "here labelled `Search transcript`" (`shell-tab.md:236`) to "here with the placeholder and accessible name `Search transcript`".
  - While editing the editor section, replace "Matching is case-insensitive subsequence matching" (`editor-tab.md:482`) with "Matching is contiguous, case-insensitive substring matching". The preceding sentence and `contiguousMatch` (`fuzzy-match.ts:120`) both say contiguous, and the source plan relies on that. This is an accuracy fix in a section this subplan already touches, not a behavior change.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Find overlay component | `web/src/shared/line-find/LineFind.tsx` (`Properties`, `LineFind`, `LineFindRow`, `editorFindBody`) | Modified in place. The file is 77 lines on disk today, so the additions stay well under the 200-line `max-lines` cap. |
| Find state | `web/src/shared/line-find/useLineFind.ts` (`useLineFind`, the private `RESULT_CAP` of 10) | Unchanged. Its memo already re-ranks a new lines array (`useLineFind.ts:29`), and its clamp effect keeps the highlighted row valid (`useLineFind.ts:36`). |
| Overlay key handling | `web/src/shared/ranked-overlay-keys.ts` (`rankedOverlayKeys`) | Unchanged. It stops every key from reaching the layers behind (`ranked-overlay-keys.ts:21`) and calls `preventDefault` for the four it handles: Up, Down, Enter, Escape. |
| Matcher | `web/src/shared/fuzzy-match.ts` (`contiguousMatch`) | Unchanged. Results already carry `index`, `score`, and one exact range (`fuzzy-match.ts:6`, `fuzzy-match.ts:133`). |
| Overlay styling | `web/src/theme.css` `.picker` (`theme.css:572`), `.picker-empty` (`theme.css:588`), `.editor-find`, `.editor-find-row`, `.editor-find-line` (`theme.css:629`), `.editor-find-text` (`theme.css:631`) | Unchanged. The PDF reuses these classes, and the status line reuses `.picker-empty`, so no CSS rule is added. |
| Plugin export | `web/src/plugins/api.ts:142` (`export { LineFind } from '../shared/line-find/LineFind'`) | Already published for plugin tabs; no export change. |
| Existing component tests | `web/src/shared/line-find/LineFind.test.tsx` | Extended beside the current cases. Test files are exempt from `max-lines` (`eslint.config.mjs:116`), so no split is needed. |
| Existing callers | `web/src/editor/EditorTab.tsx:200`, `web/src/plugins/shell/ShellTab.tsx:225` | No edits. Both pass only the existing props, so they pick up the shared name and chord behavior. Their find tests must keep passing. |

## Proposed changes

- In `web/src/shared/line-find/LineFind.tsx`, extend `Properties` (`LineFind.tsx:5`) with optional `inputRef`, `rowLabel`, and `status`. Keep all three optional; no existing caller changes.
- Attach `inputRef` to the input (`LineFind.tsx:64`), set `aria-label={placeholder}`, and keep `placeholder={placeholder}` and `autoFocus`. Do not add a visible label or change the input's styling.
- Replace the direct `rankedOverlayKeys` call (`LineFind.tsx:56`) with a local handler that checks the `Cmd+F` chord first and otherwise calls the same handler. Do not change `ranked-overlay-keys.ts`, and do not add the chord to it.
- Thread `rowLabel` into `LineFindRow` (`LineFind.tsx:30`). Keep the `.editor-find-line` span and put `rowLabel(result)` inside it when the prop is present; otherwise put `result.index + 1`.
- Extend `editorFindBody` (`LineFind.tsx:43`) with `rowLabel` and `status`. Keep the empty-query branch first. When the query is non-empty and there are no results, render `status` in place of `No matching lines` if the status is non-empty, else keep `No matching lines`. When there are results, render the rows and then the status if it is non-empty. Use `picker-row picker-empty` for the status; add no CSS.
- In `product/specs/editor-tab.md` § Finding a line and `product/specs/shell-tab.md` § Transcript search, make the wording changes listed under design decisions. Do not add `Cmd+F` text to any other spec.
- Do not edit `useLineFind.ts`, `ranked-overlay-keys.ts`, `theme.css`, `web/src/plugins/api.ts`, `EditorTab.tsx`, or `ShellTab.tsx`.

## Tests

In `web/src/shared/line-find/LineFind.test.tsx`, beside the existing cases:

- Extend the existing accessible-name case (`LineFind.test.tsx:40`) rather than adding a duplicate: beside the placeholder query, assert `getByRole('textbox', { name: 'Search transcript' })` returns the same input. This also pins that the placeholder attribute remains.
- `Cmd+F` in the input (key `f`, `metaKey` true) with the default `beta` query makes `fireEvent.keyDown` return false (default prevented, the pattern at `LineFind.test.tsx:118`), sets `selectionStart` to 0 and `selectionEnd` to the value length, does not call `onChangeQuery`, and does not reach a window `keydown` listener added as in `LineFind.test.tsx:123`. A capital `F` with `metaKey` and no shift selects the same way, pinning the lowercase check.
- `Ctrl+F`, `Cmd+Shift+F`, and `Cmd+Alt+F` do not select and do not prevent the default, and still go to `rankedOverlayKeys`: assert the same window listener stays uncalled, since that handler stops propagation for every key. `fireEvent.keyDown` returning true is the observable for "not prevented".
- An `inputRef` made with `React.createRef<HTMLInputElement>()` and passed through `renderFind`'s overrides has its `current` set to the element `input()` returns.
- A `rowLabel` that returns a distinct label per row replaces every row's `.editor-find-line` text. The existing row-number case (`LineFind.test.tsx:55`) already covers the absent-prop fallback, so leave it unchanged.
- `status` with the default results renders as the last `.picker-row`, after both `.editor-find-row`s, without changing their number or text.
- With a non-empty query and no results, `status` shows in place of `No matching lines`; with an empty query it is absent; with an empty-string `status` and no results, `No matching lines` returns, pinning that an empty status is treated as absent.
- The existing keyboard, selection, click, and highlight tests pass unchanged.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then run the focused tests:

`npm run test:client -- web/src/shared/line-find/LineFind.test.tsx web/src/editor/EditorTab.test.tsx web/src/plugins/shell/ShellTab.test.tsx`

Manual check in the running app: open an editor tab, press `Cmd+F`, type a query, press `Cmd+F` again, and confirm the query is selected and the browser find bar does not appear. Repeat in a shell tab; there the second `Cmd+F` must leave the query in place rather than reopening an empty overlay, which is what the stopped propagation protects. In both tabs the overlay must have no status line and the rows must look as before. Confirm the accessible name with the accessibility inspector or a screen reader: `Search buffer` in the editor, `Search transcript` in the shell.

## Out of scope

- Changing matching, ranking, the ten-result cap, row text, mark styling, or overlay geometry.
- Any PDF code. The PDF hook and wiring are `pdf-find-03-find-hook-and-overlay`.
- Changing `rankedOverlayKeys`, quick-open, the command palette, or the browser's own find handling outside this input.
- A new overlay component or a PDF-specific copy of `LineFind`.
- New CSS, a new overlay class, or a visible label for the input.
