# Truncate a long clipboard row where the ellipsis actually renders

**Complexity: 3/10** — revert one shared CSS declaration, add two rules of the overlay's own, and move the
label into the element that carries them.

## Summary

The pull request added `overflow: hidden` and `text-overflow: ellipsis` to `.picker-row` in `web/src/theme.css` so a
long clipboard entry would show an ellipsis. Two things are wrong with that.

**It does not render.** A `.picker-row` is a `display: flex` container, and `text-overflow` does not reach into the
anonymous flex item that a bare text child becomes — so the declaration contributed a hard clip and no ellipsis glyph.
`overflow: hidden` on the row alone does not produce a visible ellipsis at all.

**It changes thirteen other overlays.** `.picker-row` is shared by Quick Open, the command-history popup, the queue
popup, the task picker, the route chooser, the tab navigator, the profile and theme pickers, the editor's find rows,
the file navigator, and the default context menu. Because `.picker` sets `overflow-y: auto`, its horizontal axis
resolves to `auto`, so rows that previously overflowed horizontally in those overlays now clip at the row boundary —
an unreviewed visual change to every one of them.

The fix takes the truncation off the shared class and onto the clipboard popup's own row and label.

## Design decisions

### Follow `.editor-find-text` rather than inventing a shape

The editor's find rows already solve this exact problem in this exact stylesheet: a child `span` with
`overflow: hidden; text-overflow: ellipsis` inside a flex `.picker-row`. Setting `overflow` on a flex item is what makes
its automatic minimum size zero, so it shrinks and the ellipsis has something to draw — which is why the rule belongs on
the child and not the container.

So the clipboard popup gets `.clipboard-history-row` and `.clipboard-history-label`, named the way `.editor-find-row` and
`.quick-open-row` already name theirs, and the shared `.picker-row` goes back to the value it had before this pull
request.

### The label becomes an element

The popup's row currently renders `{row.label}` as a bare text child, which is precisely what prevented the ellipsis.
Wrapping it in the label `span` is what makes the CSS apply, and it costs nothing else — the row has no other children.

## Proposed changes

### 1. `web/src/theme.css`

- Restore `.picker-row` to `display: flex; align-items: center; padding: 3px 10px; cursor: pointer; white-space: nowrap;`
  with no overflow declaration.
- Add a clipboard-history section beside the other overlay sections: `.clipboard-history-row { overflow: hidden; }` and
  `.clipboard-history-label { overflow: hidden; text-overflow: ellipsis; }`, with a comment saying why the rule is on the
  label.

### 2. `web/src/overlay-plugins/clipboard-history/Popup.tsx`

- Add `clipboard-history-row` to each row's class list, keeping `picker-row` and `selected`.
- Wrap `{row.label}` in `<span className="clipboard-history-label">`.
- Update the file's comment to say the popup does need styles of its own, and why.

### 3. `web/src/overlay-plugins/clipboard-history/Popup.test.tsx`

- The three selection cases assert on `screen.getByText('…').className`, which now resolves to the label rather than
  the row that carries `selected`. They move to `.closest('.picker-row')`.
- Add a case that renders a label longer than any picker and asserts the wrapper carries `clipboard-history-label` and
  the row carries `clipboard-history-row`, so a future edit that puts the text back as a bare child fails here rather
  than in the running app.

## Tests

All in `web/src/overlay-plugins/clipboard-history/Popup.test.tsx`. Nothing else renders `.picker-row` for this overlay,
and no test asserts the reverted value on the shared class — the thirteen other overlays are verified by their own
existing tests in `web/src/pickers/` and `web/src/editor/EditorFind.test.tsx`, which must keep passing unchanged.

## Out of scope

- Verifying the rendered result in a real browser, which the test task on this pull request does.
- Changing the thirteen other overlays' long-label behaviour deliberately; if that was ever the intent it needs to be
  said out loud and tested on its own.

## Verification

- `./scripts/run.mjs check-diff`.
- `./scripts/run.mjs pr-check-gate`, which includes `npm run lint:css` over `web/src/**/*.css`.
