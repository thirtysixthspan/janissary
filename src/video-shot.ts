import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Managers } from './managers.js';

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

// Write one captured video frame beside its video file. `url` is the video tab's `/open/<id>` ref,
// resolved through the open-file allow-list the same way `saveFile` does — so a capture can only
// ever land next to a file the user explicitly opened, under a name chosen here rather than by the
// caller. Returns the basename written. Throws on an unknown ref or a payload that is not a PNG
// data URL; the RPC layer turns that into an error reply.
export function saveVideoShot(managers: Managers, url: string, dataUrl: string): string {
  const id = url.startsWith('/open/') ? url.slice('/open/'.length) : '';
  const videoPath = id ? managers.tab.openFilePath(id) : undefined;
  if (!videoPath) throw new Error(`captureVideoFrame: unknown file ref "${url}"`);
  if (!dataUrl.startsWith(PNG_DATA_URL_PREFIX)) throw new Error('captureVideoFrame: expected a PNG data URL');

  const directory = path.dirname(videoPath);
  const name = nextShotName(directory, path.basename(videoPath));
  writeFileSync(path.join(directory, name), Buffer.from(dataUrl.slice(PNG_DATA_URL_PREFIX.length), 'base64'));
  return name;
}
