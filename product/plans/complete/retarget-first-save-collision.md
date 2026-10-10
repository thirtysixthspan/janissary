# Retarget the editor reference after a first-save collision

Complexity: 4/10

## Goal

When a new-file editor saves to an auto-suffixed filename, revoke its reference to the original target and make the tab consistently represent the file it wrote.

## Approach

Use the existing file-reference replacement operation in the first-save collision branch. Update the editor's path, name, URL, size, new-file state, and tab title as one transition. Keep watcher creation after the successful write. Verify the retired URL cannot read or save the old conflicting file, and that closing the retargeted tab releases its current URL.

## Implementation steps

1. Update `finishSave` in `src/editor/save.ts` to replace the old URL when the target path changes and update the tab title with the editor metadata.
2. Extend the auto-suffix save tests to verify collision preservation, URL revocation, current URL resolution, and refusal to save through the retired URL.
3. Add cleanup coverage proving a retargeted editor's current reference is released when its tab closes.
4. Update the editor tab spec to describe reference ownership across first-save collision retargeting.
5. Check existing help and user documentation for behavior this change corrects; update only if already documented.

## Tests

- `src/editor/save.test.ts`: first-save collision keeps the original file, resolves the new URL to the suffixed file, revokes the old URL, and rejects a save through it.
- `src/tab/cleanup.test.ts`: closing a retargeted editor releases its current reference.
- `src/tab/opening-state.test.ts`: preserve duplicate-open registration behavior.

## Out of scope

- Changing the auto-suffix naming policy.
- Changing registration behavior for duplicate opens.
- Changing file watching beyond preserving the existing first-save watcher setup.
