# Protect editor external reloads

**Complexity: 5/10** — the race is isolated to one editor lifecycle hook and its existing unit tests. The fix adds request ordering and a second dirty-state gate without changing the file-watch or save protocols.

## Goal

An external file read must never replace edits made while that read is in flight, and an older external read must never overwrite a newer one that completed first.

## Approach

Assign each watched reload a local sequence number. Only the latest request may apply its result, and it must re-check the live dirty state immediately before loading. If the buffer became dirty, preserve it and set the existing conflict flag so the next save uses the established overwrite prompt.

## Implementation steps

1. Add latest-request tracking and a post-read dirty check to `useEditorWatchReload`.
2. Expand the hook tests to cover typing during a pending read and out-of-order read completion.
3. Clarify the external-change guarantee in the editor functional spec, remove the backlog entry, and promote this plan after checks pass.

## Tests

- `web/src/editor/useEditorWatchReload.test.ts`: a pending reload cannot overwrite newly dirty input and instead records a conflict; an older read resolving after a newer read cannot replace the newer disk content.
- Preserve the existing clean reload, cursor, initially dirty, unchanged mtime, missing mtime, first mtime, and failed-read cases.

## Out of scope

- Changing file watcher delivery or server mtime behavior.
- Changing the conflict dialog or overwrite flow.
- Cancelling an in-flight network request.
- Changing initial editor loading.
