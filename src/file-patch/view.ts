import path from 'node:path';
import { failureResult, fileOperationReason, runFileOperation, type FileOperationResult } from '../file-navigator/file-operation-result.js';
import { resolveMutationTarget } from '../file-write/target.js';
import { placeKeys, readPatchContent, type PatchContent, type PatchPlace, type PlaceKeys } from './view-entry.js';

// Only section application may change place existence, link text, content references, or current text.
export interface PatchView {
  resolve(requested: string): FileOperationResult<PatchPlace>;
  resolveLink(place: PatchPlace): FileOperationResult<PatchPlace>;
  places(): readonly PatchPlace[];
  contents(): readonly PatchContent[];
  plannedFolders(): readonly string[];
}

export function createPatchView(root: string): PatchView {
  const places = new Map<string, PatchPlace>();
  const contents = new Map<string, PatchContent>();
  const links = new Map<string, PatchPlace>();

  function plannedFolders(): string[] {
    const folders = new Set<string>();
    for (const place of places.values()) {
      if (place.exists) for (const folder of place.missingFolders) folders.add(folder);
    }
    return [...folders].toSorted((a, b) => a.split(path.sep).length - b.split(path.sep).length);
  }

  function checkFolders(keys: PlaceKeys): string | undefined {
    if (plannedFolders().includes(keys.location)) return 'Is a directory';
    if (keys.missingFolders.some((folder) => places.get(folder)?.exists)) return fileOperationReason({ code: 'ENOTDIR' });
    return undefined;
  }

  function resolvePath(requested: string, implicit: boolean): FileOperationResult<PatchPlace> {
    const target = resolveMutationTarget(root, requested);
    if (!target.ok) return target;
    const result = runFileOperation((): FileOperationResult<PatchPlace> => {
      const keys = placeKeys(root, requested, target.value);
      const refusal = checkFolders(keys);
      if (refusal !== undefined) return failureResult(refusal);
      const existing = places.get(keys.location) ?? (keys.linkIdentity === undefined ? undefined : links.get(keys.linkIdentity));
      if (existing !== undefined) {
        if (!implicit) existing.implicit = false;
        return { ok: true, value: existing };
      }
      let content = contents.get(keys.realPath);
      if (content === undefined) {
        const read = readPatchContent(keys.realPath, target.value.exists);
        if (!read.ok) return read;
        content = read.value;
        contents.set(keys.realPath, content);
      }
      const place: PatchPlace = { requested, location: keys.location, existed: target.value.exists, exists: target.value.exists,
        linkText: keys.linkText, missingFolders: keys.missingFolders, content, implicit };
      places.set(keys.location, place);
      if (keys.linkIdentity !== undefined) links.set(keys.linkIdentity, place);
      return { ok: true, value: place };
    });
    return result.ok ? result.value : result;
  }

  function resolve(requested: string): FileOperationResult<PatchPlace> {
    return resolvePath(requested, false);
  }

  function resolveLink(place: PatchPlace): FileOperationResult<PatchPlace> {
    const target = path.resolve(path.dirname(place.location), place.linkText ?? '');
    return resolvePath(path.relative(root, target), true);
  }

  return { resolve, resolveLink, places: () => [...places.values()], contents: () => [...contents.values()], plannedFolders };
}
