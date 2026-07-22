# Editor tab: hide the "Accept or decline… N of M remaining" banner for a single proposed change

**Complexity: 3/10** — a one-line early-return in an existing presentational component, plus updating the tests and spec wording that assumed the banner always shows. No hook/state-machine changes.

## Goal

`PendingSuggestPanel` renders a banner ("Accept or decline each change below" + "N of M remaining") above the buffer whenever any persona suggestion is pending, regardless of how many changes were proposed. Per the backlog report, once a persona ACP call proposes only a single change, the "1 of 1 remaining" banner is residual from an earlier version of the feature: before `#562` (`feat(editor): show all pending suggestion hunks at once with thumbs-icon approval`), every proposed change was resolved one at a time and the banner's counter was the only progress indicator. Since `#562`, every pending hunk already previews inline with its own accept/decline icons (`EditorLines.tsx`), so for a single proposed change the icons alone are sufficient — the banner adds no information and should no longer appear. The banner still earns its place when multiple changes are pending at once, since the aggregate counter is genuinely useful there.

## Approach

`PendingSuggestPanel` already receives the full `PendingSuggest` (with `hunks`), so the fix is contained to that component: return `null` when `pending.hunks.length <= 1`, in addition to the existing `!pending` check. `EditorLines.tsx`'s per-hunk diff preview and accept/decline icons are driven directly by `suggest.pending`, independent of `PendingSuggestPanel`, so hiding the banner doesn't affect the ability to accept or decline the single change — only the redundant summary text disappears.

## Implementation steps

1. In `web/src/editor/PendingSuggestPanel.tsx`, add `if (pending.hunks.length <= 1) return null;` after the existing `if (!pending) return null;` check. Update the file's header comment to note the banner is skipped for a single pending change.

## Tests

In `web/src/EditorTab.test.tsx` (the "in-editor persona suggestions" describe block):

- `fires an editorSuggest query on Ctrl/Cmd+Enter and shows the pending panel` — rename to reflect the new behavior and change its wait/assert target from the banner text to the diff preview (`.editor-diff-controls`, already covered in detail by the next test) appearing, then assert `screen.queryByText('Accept or decline each change below')` is **not** in the document for this single-hunk case.
- `previews the pending hunk inline: …` — unaffected (already asserts on diff elements, not the banner).
- `accepts a hunk by clicking its accept icon, updates the buffer, and removes the request line` — change the wait condition from the banner text to `.editor-diff-controls` appearing (or `screen.getByLabelText('Accept')` resolving), since the banner never appears for this single-hunk case; keep the post-accept assertions.
- `declines every hunk by clicking decline, leaving the buffer and request line unchanged` — same wait-condition change as above.
- `blocks ordinary typing while a hunk is pending` — same wait-condition change; replace the post-keypress banner-presence assertion with an assertion that the diff preview / request line are still present.
- `previews multiple hunks simultaneously and resolves them independently` — unchanged; two total hunks keep the banner visible throughout ("2 of 2 remaining" → "1 of 2 remaining" → gone), exercising the case the banner is still meant for.

## Spec updates

- `product/specs/editor-tab.md` ("In-editor persona suggestions" section, the paragraph starting "The persona may propose one or more edits…") — clarify that the "Accept or decline each change below" banner and remaining-count only appear once **two or more** changes are proposed at once; a single proposed change shows only its own inline accept/decline icons.

## Docs

- Checked `help.md` and `documentation/user-documentation/` — neither documents the suggestion banner's appearance conditions; no update needed.

## Out of scope

- `EditorLines.tsx`'s per-hunk diff preview and accept/decline icons — unchanged, they already render independently of the banner.
- `useEditorSuggest.ts`'s resolution/finalization logic — unchanged; the fix is purely presentational.
- The remaining backlog issue (transcript buttons on ACP connection rows) — not touched here.
