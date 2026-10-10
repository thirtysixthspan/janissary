# Launcher summarizes open editor content

**Complexity: 5/10** — editor tabs have no ordinary transcript, so the host must read the live draft or registered file content and track changes independently from transcript counters.

## Goal

When an editor tab is open, make its launcher summary describe the file shown in the editor, including unsaved changes.

## Approach

Extract the editor's existing draft-first, file-fallback content reader so both monitoring and launcher activity use the same source. On a transcript-tail request, activity reads a bounded snapshot for editor tabs and reports a content fingerprint used by the summarizer cursor. The launcher still receives no editor content in ordinary row updates.

## Implementation steps

1. Add `src/editor/content.ts` with the shared editor-content reader and update `src/monitor/editor-feed.ts` to use it.
2. Extend tab activity entries with an optional editor-content fingerprint and return a bounded editor snapshot only when the caller requests a tail.
3. Update launcher summarizer cursor comparison and tests so editor content changes, including same-length edits, trigger a new prompt.
4. Update `product/specs/launcher.md` to describe editor summaries as summaries of the open file, including the live draft.

## Tests

- `src/editor/content.test.ts`: draft takes precedence over disk; registered file is the fallback; an unresolved new file without a draft has no content.
- `src/plugins/activity.test.ts`: editor content is absent from ordinary reads, requested content is bounded, and the fingerprint changes with same-length file edits.
- `src/plugins/launcher/summarizer.test.ts`: same-length editor-content changes move past the saved cursor.
- Existing `src/monitor/editor-feed.test.ts` behavior remains covered after the reader is extracted.

## Out of scope

- Changing how editor buffers load, save, or synchronize drafts.
- Changing summaries for shell, harness, or SSH tabs.
- Updating user documentation that does not currently describe editor-content summaries.
