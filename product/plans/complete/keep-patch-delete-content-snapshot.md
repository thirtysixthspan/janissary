# Keep the patch delete record's content a snapshot

**Complexity: 1/10** — one production file edited, one behavioral requirement, two test scenarios (p=2.92)

## Goal

A patch delete record keeps the text that was deleted, even when a later section re-adds a regular file at the same path. `changes.deletes[].content.current` reports the deleted file's text while `changes.writes` reports the replacement text, matching what the link variant already does.

## Approach

`remove` in `src/file-patch/sections.ts` stores `place.content` — the live content object — in the delete record. `add` reuses that same object for a regular file and assigns the new text to `content.current`, so the record's view of the deleted text mutates with the replacement. A deleted link is unaffected because `add` gives the place fresh content and leaves the recorded object behind.

Store a copy of the content object in the delete record instead. The copy keeps the same `realPath`, original bytes, mode, and BOM flag, so `commitChanges` reads the same restore data, while a later `add` mutates only the place's live object. The delete record becomes fixed at record time, as the change list already describes it.

## Implementation steps

1. In `src/file-patch/sections.ts`, change the delete record's `content: place.content` to `content: { ...place.content }`.
2. Run `$janissary/scripts/run.mjs check-diff`.

## Tests

- `src/file-patch/sections.test.ts`: add a case named `keeps the deleted text in the delete record when a regular file is re-added`. Create `a` with `old\n`, apply `*** Delete File: a` then `*** Add File: a` with `+new`, and assert `changes.deletes` has one entry whose `content.current` is `old\n` while `changes.writes[0].text` is `new\n`.
- The existing `collapses successive operations and retains delete and add` case, the BOM-dropping assertions in `validates text including the retained BOM`, and the commit restore cases in `src/file-patch/commit.test.ts` and `src/file-patch/apply.test.ts` must keep passing unchanged.

## Out of scope

- Move-source delete records, which retain the moved content object by design; the finding covers delete-then-add of a regular file only.
- Any behavior that reads the recorded text today, such as a new restore or report path.
- `help/file.md` and `product/specs/acp.md`: no user-visible behavior changes, and the reported rows and restore guarantees are already documented.
