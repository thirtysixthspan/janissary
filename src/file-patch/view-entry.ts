import { lstatSync, readlinkSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { type FileOperationResult } from '../file-navigator/file-operation-result.js';
import { readBoundedRegularFile } from '../file-write/bounded-read.js';
import { decodeEditableText } from '../file-write/edit-text.js';
import { type WriteTarget } from '../file-write/target.js';

export interface PatchContent {
  readonly realPath: string;
  readonly original: Buffer | undefined;
  readonly mode: number | undefined;
  readonly hadBom: boolean;
  current: string | undefined;
}

export interface PatchPlace {
  readonly requested: string;
  readonly location: string;
  readonly existed: boolean;
  readonly missingFolders: readonly string[];
  exists: boolean;
  linkText: string | undefined;
  content: PatchContent;
}

export interface PlaceKeys {
  location: string;
  realPath: string;
  linkText: string | undefined;
  linkIdentity: string | undefined;
  missingFolders: string[];
}

export function placeKeys(root: string, requested: string, target: WriteTarget): PlaceKeys {
  let location = target.realPath;
  let realPath = target.realPath;
  let linkText: string | undefined;
  let linkIdentity: string | undefined;
  if (target.exists) {
    const lexical = path.resolve(root, requested);
    const entry = path.join(realpathSync.native(path.dirname(lexical)), path.basename(lexical));
    const stats = lstatSync(entry);
    if (stats.isSymbolicLink()) {
      location = entry;
      linkText = readlinkSync(entry);
      linkIdentity = `${stats.dev}:${stats.ino}`;
    } else {
      realPath = realpathSync.native(target.realPath);
      location = realPath;
    }
  }
  const missingFolders: string[] = [];
  let folder = path.dirname(target.realPath);
  for (let index = 0; index < target.missingSegments.length; index += 1) {
    missingFolders.unshift(folder);
    folder = path.dirname(folder);
  }
  return { location, realPath, linkText, linkIdentity, missingFolders };
}

export function readPatchContent(realPath: string, exists: boolean): FileOperationResult<PatchContent> {
  if (!exists) return { ok: true, value: { realPath, original: undefined, mode: undefined, hadBom: false, current: undefined } };
  const mode = statSync(realPath).mode & 0o777;
  const bytes = readBoundedRegularFile(realPath);
  if (!bytes.ok) return bytes;
  const decoded = decodeEditableText(bytes.value);
  if (!decoded.ok) return decoded;
  const hadBom = decoded.value.startsWith('\u{FEFF}');
  return { ok: true, value: { realPath, original: bytes.value, mode, hadBom, current: hadBom ? decoded.value.slice(1) : decoded.value } };
}
