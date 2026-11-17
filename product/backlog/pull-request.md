<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Keep the patch delete record's content a true snapshot when a regular file is deleted and then re-added, rather than letting the add overwrite the recorded text.

Existing Issue: A Delete-then-Add of a regular file writes the new text into the `PatchContent` object the delete record holds, so `changes.deletes[].content.current` reports the new text instead of the deleted file's text, while the link variant replaces its content first and keeps the original. Severity: 3/10

Existing Risk: 2/10 - Nothing consumes the recorded text today, but the plan calls the delete record a snapshot, so a future restore or report that reads it would silently use the replacement text and diverge from the file the patch actually deleted.

Proposal Risk: 1/10 - The delete record becomes fixed at record time while the commit still reads the same original bytes and mode; the only risk is a write keyed to the replaced content object, which the existing Delete-then-Add and commit restore cases would catch.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2011 "keep the patch delete record's content a snapshot for a regular delete-then-add". In `src/file-patch/sections.ts`'s `remove`, store a copy of the place's content (`{ ...place.content }`) in the delete record instead of the live object, so a later `add` can keep using the place's content while the record retains the text that was deleted; the bytes, mode, and link text are already captured by value, so the commit and restore read the same values as today. Add a case to `src/file-patch/sections.test.ts` that applies `*** Delete File: a` then `*** Add File: a` with `+new` to a file holding `old\n` and asserts `changes.deletes` has one entry whose `content.current` is `old\n` while `changes.writes[0].text` is `new\n`, mirroring the link assertion in `handles links, shared content, and recreation`. The existing `collapses successive operations and retains delete and add` case, the BOM-dropping assertions in `validates text including the retained BOM`, and the commit restore cases in `src/file-patch/commit.test.ts` and `src/file-patch/apply.test.ts` must keep passing.
