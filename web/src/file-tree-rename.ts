export type RenameResult = { type: 'noop' } | { type: 'rename'; newName: string; newPath: string };

export function renameResult(path: string, rawName: string): RenameResult {
  const newName = rawName.trim();
  const name = path.slice(path.lastIndexOf('/') + 1);
  if (!newName || newName === name) return { type: 'noop' };
  const parent = path.lastIndexOf('/');
  return { type: 'rename', newName, newPath: parent === -1 ? newName : `${path.slice(0, parent)}/${newName}` };
}

export function hasRenameCollision(newName: string, siblingNames: Set<string>): boolean {
  return siblingNames.has(newName);
}

export function renameSelectionRange(name: string, dir: boolean): [number, number] {
  const extension = name.lastIndexOf('.');
  return dir || extension <= 0 ? [0, name.length] : [0, extension];
}
