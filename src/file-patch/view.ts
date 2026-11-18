import path from 'node:path';
import { canonicalPath, foldCase } from '../file-read/canonical.js';
import { failureResult, fileOperationReason, runFileOperation, type FileOperationResult } from '../file-navigator/file-operation-result.js';
import { resolveMutationTarget } from '../file-write/target.js';
import { volumeIgnoresCase } from './volume-case.js';
import { placeKeys, readPatchContent, type PatchContent, type PatchPlace, type PlaceKeys } from './view-entry.js';

export interface PatchViewReads {
  places(): readonly PatchPlace[];
  plannedFolders(): readonly string[];
  folderKey(folder: string): string;
}

// Only section application may change place existence, link text, content references, or current text.
// Existence changes go through setExists so the planned-folder index stays current.
export interface PatchView extends PatchViewReads {
  resolve(requested: string): FileOperationResult<PatchPlace>;
  resolveLink(place: PatchPlace): FileOperationResult<PatchPlace>;
  setExists(place: PatchPlace, value: boolean): void;
  contents(): readonly PatchContent[];
}

function resolveCanonicalRoot(root: string): string {
  try {
    return canonicalPath(root);
  } catch {
    return root;
  }
}

export function createPatchView(root: string, caseInsensitive = volumeIgnoresCase(root)): PatchView {
  const canonicalRoot = resolveCanonicalRoot(root);
  const places = new Map<string, PatchPlace>();
  const folded = new Map<string, PatchPlace>();
  const contents = new Map<string, PatchContent>();
  const links = new Map<string, PatchPlace>();
  const planned = new Map<string, number>();
  let plannedList: readonly string[] | undefined;
  let namedCount = 0;

  function foldedPlace(location: string): PatchPlace | undefined {
    return caseInsensitive ? folded.get(foldCase(location)) : undefined;
  }

  function placeAt(location: string): PatchPlace | undefined {
    return places.get(location) ?? foldedPlace(location);
  }

  function planKey(folder: string): string {
    return caseInsensitive ? foldCase(folder) : folder;
  }

  function contribute(place: PatchPlace, delta: 1 | -1): void {
    for (const folder of place.missingFolders) {
      const key = planKey(folder);
      const count = (planned.get(key) ?? 0) + delta;
      if (count === 0) planned.delete(key);
      else planned.set(key, count);
    }
  }

  function setExists(place: PatchPlace, value: boolean): void {
    if (place.exists === value) return;
    place.exists = value;
    contribute(place, value ? 1 : -1);
    plannedList = undefined;
  }

  function derivePlannedFolders(): readonly string[] {
    const folders = new Map<string, string>();
    for (const place of places.values()) {
      if (place.exists) for (const folder of place.missingFolders) {
        const key = planKey(folder);
        if (!folders.has(key)) folders.set(key, folder);
      }
    }
    return [...folders.values()].toSorted((a, b) => a.split(path.sep).length - b.split(path.sep).length);
  }

  function plannedFolders(): readonly string[] {
    plannedList ??= derivePlannedFolders();
    return plannedList;
  }

  function checkFolders(keys: PlaceKeys): string | undefined {
    if (planned.has(planKey(keys.location))) return 'Is a directory';
    if (keys.missingFolders.some((folder) => placeAt(folder)?.exists)) return fileOperationReason({ code: 'ENOTDIR' });
    return undefined;
  }

  function namePlace(place: PatchPlace): void {
    if (place.firstNamed !== undefined) return;
    place.firstNamed = namedCount;
    namedCount += 1;
  }

  function resolvePath(requested: string, implicit: boolean): FileOperationResult<PatchPlace> {
    const target = resolveMutationTarget(root, requested);
    if (!target.ok) return target;
    const result = runFileOperation((): FileOperationResult<PatchPlace> => {
      const keys = placeKeys(root, requested, target.value);
      const refusal = checkFolders(keys);
      if (refusal !== undefined) return failureResult(refusal);
      const existing = places.get(keys.location)
        ?? (keys.linkIdentity === undefined ? undefined : links.get(keys.linkIdentity))
        ?? foldedPlace(keys.location);
      if (existing !== undefined) {
        if (!implicit) {
          existing.implicit = false;
          namePlace(existing);
        }
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
      if (!implicit) namePlace(place);
      places.set(keys.location, place);
      if (caseInsensitive) folded.set(foldCase(keys.location), place);
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
    return resolvePath(path.relative(canonicalRoot, target), true);
  }

  return { resolve, resolveLink, setExists, places: () => [...places.values()], contents: () => [...contents.values()], plannedFolders, folderKey: planKey };
}
