# Shared find overlay support for the PDF tab

**Complexity: 3/10** — one shared component gains three optional props and one key branch, and two specs gain a sentence. The editor and shell must keep rendering and behaving exactly as they do today.

## Goal

Make `LineFind` ready to be the PDF tab's find overlay. The input gets an accessible name equal to its placeholder, `Cmd+F` inside the input selects the whole query instead of reaching the browser, and callers can attach an input ref, replace the line-number label, and show a muted status line. Record the shared key and name behavior in the editor and shell specs.

## Design decisions and dependencies

This subplan depends on nothing earlier. `pdf-find-03-find-hook-and-overlay` consumes the new props, and `pdf-find-05-specs-docs-and-verification` documents the final PDF behavior. `useLineFind` and `rankedOverlayKeys` stay unchanged.

- The accessible name is `aria-label={placeholder}` on the input. The placeholder attribute stays, so `getByPlaceholderText` keeps working, and every caller gets a name with no new prop: `Search buffer`, `Search transcript`, and later `Search document`.
- The key handler checks for `Cmd+F` before handing the event to `rankedOverlayKeys`. The check is meta and `f` with no other modifier (`metaKey`, not `ctrlKey`, not `altKey`, not `shiftKey`, and `key.toLowerCase() === 'f'`). It calls `preventDefault`, calls `stopPropagation`, and selects the whole input through `event.currentTarget.select()`. This keeps the browser's find bar from opening and keeps the window chord handler from seeing the key. `rankedOverlayKeys` stays as it is because quick-open shares it and has no find chord.
- `inputRef` is an optional `React.RefObject<HTMLInputElement | null>` attached to the input. The PDF hook uses it to focus the input and select its query when `Cmd+F` arrives while the overlay is open but focus has moved outside it.
- `rowLabel` is an optional `(result: FuzzyMatchResult) => React.ReactNode`. When it is absent a row shows `result.index + 1`, exactly as today. The PDF passes a function that returns the line's 1-based page number, which lands in the existing dimmed `.editor-find-line` column. The row text keeps the existing `.editor-find-text` clipping and ellipsis, so a long line is not wrapped.
- `status` is an optional string, shown only when the trimmed query is non-empty. It sits below the rows when there are results, and it takes the place of `No matching lines` when there are none. The PDF uses it for `Reading pages…`; the editor and shell pass nothing.
- An empty query still shows only the `type to search` hint. The status is not shown there.
- The editor and shell call sites do not pass any of the three props. Their only behavior change is the shared one the source plan asks for: `Cmd+F` inside the open overlay selects the query, and the input's accessible name equals its placeholder.
- `product/specs/editor-tab.md` § Finding a line and `product/specs/shell-tab.md` § Transcript search each gain one sentence for `Cmd+F` inside the open overlay selecting the query, and one clause naming the input by its placeholder. While editing the editor section, correct its sentence that calls the matcher "case-insensitive subsequence matching". The preceding sentence and `contiguousMatch` both say contiguous, and the source plan relies on that. This is an accuracy fix in a section this subplan already touches, not a behavior change.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Find overlay component | `web/src/shared/line-find/LineFind.tsx` | Modified in place. The file is about 77 lines, so the additions fit well under the 200-line rule. |
| Find state | `web/src/shared/line-find/useLineFind.ts` (`useLineFind`, `RESULT_CAP`) | Unchanged. Its memo already re-ranks a new lines array, and its clamp effect keeps the highlighted row valid. |
| Overlay key handling | `web/src/shared/ranked-overlay-keys.ts` (`rankedOverlayKeys`) | Unchanged. It still swallows Up, Down, Enter, Escape, Page Up, and Page Down for every overlay. |
| Matcher | `web/src/shared/fuzzy-match.ts` (`contiguousMatch`) | Unchanged. Results already carry `index`, `score`, and one exact range. |
| Overlay styling | `web/src/theme.css` `.editor-find`, `.editor-find-row`, `.editor-find-line`, `.editor-find-text`, `.picker` | Unchanged. The PDF reuses these classes. |
| Existing component tests | `web/src/shared/line-find/LineFind.test.tsx` | Extended beside the current cases. |
| Existing callers | `web/src/editor/EditorTab.tsx`, `web/src/plugins/shell/ShellTab.tsx` | No edits. Their find tests must keep passing. |

## Proposed changes

- In `web/src/shared/line-find/LineFind.tsx`, extend `Properties` with `inputRef?`, `rowLabel?`, and `status?`.
- Pass `inputRef` to the input, set `aria-label={placeholder}`, and keep `placeholder={placeholder}`.
- Change the key handler into a small wrapper around `rankedOverlayKeys`. The wrapper handles the `Cmd+F` branch first, then calls the handler returned by `rankedOverlayKeys` for every other key.
- Thread `rowLabel` into `LineFindRow`. Use `rowLabel(result)` when present, otherwise `result.index + 1`.
- Thread `status` into the body renderer. Keep the current empty-query and no-match branches, with the status replacing `No matching lines` when results are empty and the query is non-empty, and appending below the rows when there are results.
- In `product/specs/editor-tab.md` § Finding a line and `product/specs/shell-tab.md` § Transcript search, add the `Cmd+F` selection sentence and the accessible-name wording. Make the one-word contiguous correction in the editor section.
- Do not edit `useLineFind.ts` or `ranked-overlay-keys.ts`.

## Tests

In `web/src/shared/line-find/LineFind.test.tsx`, beside the existing cases:

- The input's accessible name is its placeholder, checked with `getByRole('textbox', { name: 'Search buffer' })` and again with a different placeholder.
- `Cmd+F` in the input selects the whole query (`selectionStart` 0 and `selectionEnd` equal to the value length), prevents the default, and does not call `onChangeQuery`. `Ctrl+F`, `Cmd+Shift+F`, and `Cmd+Alt+F` are not treated as the select-query branch and still go to `rankedOverlayKeys`.
- An `inputRef` passed to the component receives the input element.
- A `rowLabel` replaces the default line number for every row, and omitting it still shows `result.index + 1`.
- `status` appears below the rows when there are results, replaces `No matching lines` when there are none, and does not appear for an empty query.
- The existing keyboard, selection, click, and highlight tests pass unchanged.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then run the focused tests:

`npm run test:client -- web/src/shared/line-find/LineFind.test.tsx web/src/editor/EditorTab.test.tsx web/src/plugins/shell/ShellTab.test.tsx`

Manual check in the running app: open an editor tab, press `Cmd+F`, type a query, press `Cmd+F` again, and confirm the query is selected and the browser find bar does not appear. Repeat in a shell tab. The rest of both overlays must look and behave as before.

## Out of scope

- Changing matching, ranking, the ten-result cap, row text, mark styling, or overlay geometry.
- Any PDF code. The PDF hook and wiring are `pdf-find-03-find-hook-and-overlay`.
- Changing `rankedOverlayKeys`, quick-open, the command palette, or the browser's own find handling outside this input.
- A new overlay component or a PDF-specific copy of `LineFind`.
