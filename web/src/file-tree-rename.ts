// Pure, DOM-free helpers for the file tree's in-place rename field — kept out of `FileTreeTab.tsx`
// so the component stays under the file-size limit, mirroring `file-tree-new-file.ts`.

export type RenameOutcome = { type: 'noop' } | { type: 'rename'; newRelPath: string };

// Given the row's tree-relative path and the raw text from the edit field, decides whether a
// commit is a real rename or a silent no-op (empty/whitespace-only, or unchanged from the current
// basename). A real rename stays in the same directory — only the basename changes.
export function computeRename(relPath: string, rawName: string): RenameOutcome {
  const trimmed = rawName.trim();
  const lastSlash = relPath.lastIndexOf('/');
  const originalName = lastSlash === -1 ? relPath : relPath.slice(lastSlash + 1);
  if (!trimmed || trimmed === originalName) return { type: 'noop' };
  const parent = lastSlash === -1 ? '' : relPath.slice(0, lastSlash);
  return { type: 'rename', newRelPath: parent ? `${parent}/${trimmed}` : trimmed };
}

// Whether `newName` collides with a sibling already visible in the same directory — the same
// same-directory-collision check the drag-move flow already runs before sending its RPC.
export function hasRenameCollision(newName: string, siblingNames: string[]): boolean {
  return siblingNames.includes(newName);
}

// The names of every visible row sharing `relPath`'s parent directory, excluding `relPath` itself
// — the candidate set `hasRenameCollision` checks the new name against.
export function siblingNames(rows: { path: string; name: string }[], relPath: string): string[] {
  const lastSlash = relPath.lastIndexOf('/');
  const parent = lastSlash === -1 ? '' : relPath.slice(0, lastSlash);
  return rows
    .filter((r) => r.path !== relPath)
    .filter((r) => {
      const rSlash = r.path.lastIndexOf('/');
      const rParent = rSlash === -1 ? '' : r.path.slice(0, rSlash);
      return rParent === parent;
    })
    .map((r) => r.name);
}
