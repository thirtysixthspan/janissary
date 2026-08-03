import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const PNG_DATA_URL_PREFIX = 'data:image/png;base64,';

// The next free `<base>.shot-<n>.png` in `dir` for a video named `videoName`, numbering from 1.
// Deliberately not a variant of `nextFreeName` (src/editor/next-free-name.ts): that one starts from
// a candidate name and appends `-2` only once it is taken, while shots always carry a number and use
// a different separator. Pure filesystem check — the caller owns the create-time race.
export function nextShotName(dir: string, videoName: string): string {
  const extension = path.extname(videoName);
  const base = videoName.slice(0, videoName.length - extension.length);
  for (let n = 1; ; n++) {
    const candidate = `${base}.shot-${n}.png`;
    if (!existsSync(path.join(dir, candidate))) return candidate;
  }
}

// Write one captured frame beside the server-owned path in the video tab payload. The generic intent
// router supplies that authoritative payload, so the client never chooses a destination or name.
// Returns the basename written and rejects anything other than a PNG data URL.
export function saveVideoShot(videoPath: string, dataUrl: string): string {
  if (!dataUrl.startsWith(PNG_DATA_URL_PREFIX)) throw new Error('video capture expected a PNG data URL');

  const directory = path.dirname(videoPath);
  const name = nextShotName(directory, path.basename(videoPath));
  writeFileSync(path.join(directory, name), Buffer.from(dataUrl.slice(PNG_DATA_URL_PREFIX.length), 'base64'));
  return name;
}
