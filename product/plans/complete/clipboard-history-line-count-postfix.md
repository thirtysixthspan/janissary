# Show a multi-line clipboard entry's line count instead of an ellipsis

**Complexity: 2/10** — a change to the clipboard popup's pure display rule, the row markup, and two CSS rules, all inside the plugin's own directory and its stylesheet block.

## Goal

The clipboard-history popup shows one line per entry. Today a copy with more than one line gets `…` appended to its first line, which reads the same as a long single line that CSS clips. The pull request backlog asks for a clearer signal:

- A multi-line entry is postfixed with `(N lines)` instead of the ellipsis.
- The ellipsis appears only when the text is too long to fit on the row, with the postfix taken into account, so a long first line is clipped before the postfix rather than pushing it off the row.
- The postfix is display only. It is never pasted into the target.

## Approach

`displayLine` in `web/src/overlay-plugins/clipboard-history/display.ts` is the pure derivation. It stops appending `MORE_MARKER` and instead returns the first line of non-space text plus a `postfix` string: `(N lines)` when the copy has more than one line, otherwise empty. `N` counts the lines of the copy with leading and trailing whitespace removed, so a copy that merely ends in a newline, or opens with blank lines, is not reported as more lines than the text the user sees in it. Before this change such a copy carried an ellipsis; a `(2 lines)` postfix on a one-line copy would be misleading in a way the ellipsis was not.

The store's rows carry the postfix next to the label as a plugin-local row type (`OverlayPluginItem` plus `postfix`), so the overlay contract in `api.ts` does not change. The popup renders the postfix in its own span after the label.

The row is already a flex container with `white-space: nowrap`. The label becomes the shrinking flex item (`min-width: 0; flex: 0 1 auto` with the existing `overflow: hidden; text-overflow: ellipsis`) and the postfix is `flex: none` with a small left margin and the muted color. CSS then clips the label with the ellipsis only when the label and the postfix together would overflow the row, and the postfix always stays visible.

Pasting already uses the entry's stored `text`, never the label or the postfix, so the postfix cannot reach the target.

## Implementation steps

1. `web/src/overlay-plugins/clipboard-history/display.ts` — replace `MORE_MARKER` and `truncated` with a `postfix` field; count lines of the fully trimmed text; update the module comment to describe the new rule.
2. `web/src/overlay-plugins/clipboard-history/store.ts` — export a `ClipboardHistoryRow` type (`OverlayPluginItem & { postfix: string }`) and build rows with the label and postfix from `displayLine`.
3. `web/src/overlay-plugins/clipboard-history/Popup.tsx` — render `<span className="clipboard-history-lines">` after the label when the postfix is non-empty; update the header comment.
4. `web/src/theme.css` — make `.clipboard-history-label` the shrinking item and add `.clipboard-history-lines` (no shrink, muted, small left margin, and the selected-row color so it stays readable on the accent background).

## Tests

- `display.test.ts`: a single line has no postfix; `first\nsecond\nthird` reads `first` with `(3 lines)`; a copy ending in a newline has no postfix; leading blank lines are not counted; the label never carries an ellipsis.
- `Popup.test.tsx`: a multi-line entry renders its first line and a separate `(2 lines)` element with the `clipboard-history-lines` class; a single-line entry renders no postfix element; clicking a multi-line row passes the full stored text to `choose`, without the postfix.

## Spec and docs

- `product/specs/clipboard-history.md` "How an entry reads" — describe the `(N lines)` postfix and that the ellipsis now only marks a line too long for the popup, with the postfix kept visible.
- `documentation/user-documentation/command-bar/clipboard.md` "What an entry looks like" — same correction.

## Out of scope

- Any change to `OverlayPluginItem` in the overlay contract.
- Windows `\r\n` handling beyond what the existing rule does.
- Other overlays' long-label behavior.
