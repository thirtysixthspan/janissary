import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const PNG_DATA_URL_PREFIX = 'data:image/png;base64,';

// The next free `<base>.<token>-<n>.png` in `dir` for a source file named `sourceName`, numbering
// from 1. One rule for "a numbered PNG beside an original", shared by the video plugin's frame
// capture (`shot`) and the image plugin's saved edit (`edit`).
//
// Deliberately not a variant of `nextFreeName` (src/editor/next-free-name.ts): that one starts from
// a candidate name and appends `-2` only once it is taken, while these always carry a number and use
// a different separator. Pure filesystem check — the caller owns the create-time race.
export function nextNumberedSibling(dir: string, sourceName: string, token: string): string {
  const extension = path.extname(sourceName);
  const base = sourceName.slice(0, sourceName.length - extension.length);
  for (let n = 1; ; n++) {
    const candidate = `${base}.${token}-${n}.png`;
    if (!existsSync(path.join(dir, candidate))) return candidate;
  }
}

// Write client-produced pixels beside a server-owned path. The generic intent router supplies that
// authoritative path, so the client never chooses a destination or a name. Returns the basename
// written and rejects anything other than a PNG data URL; `subject` names the caller in that error.
export function writePngSibling(
  sourcePath: string, dataUrl: string, token: string, subject: string,
): string {
  if (!dataUrl.startsWith(PNG_DATA_URL_PREFIX)) throw new Error(`${subject} expected a PNG data URL`);

  const directory = path.dirname(sourcePath);
  const name = nextNumberedSibling(directory, path.basename(sourcePath), token);
  writeFileSync(path.join(directory, name), Buffer.from(dataUrl.slice(PNG_DATA_URL_PREFIX.length), 'base64'));
  return name;
}
