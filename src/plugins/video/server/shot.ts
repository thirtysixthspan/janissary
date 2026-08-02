import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const PNG_DATA_URL_PREFIX = 'data:image/png;base64,';

export function nextShotName(dir: string, videoName: string): string {
  const extension = path.extname(videoName);
  const base = videoName.slice(0, videoName.length - extension.length);
  for (let number = 1; ; number++) {
    const candidate = `${base}.shot-${number}.png`;
    if (!existsSync(path.join(dir, candidate))) return candidate;
  }
}

export function saveVideoShot(videoPath: string, dataUrl: string): string {
  if (!dataUrl.startsWith(PNG_DATA_URL_PREFIX)) throw new Error('capture-frame: expected a PNG data URL');
  const directory = path.dirname(videoPath);
  const name = nextShotName(directory, path.basename(videoPath));
  writeFileSync(path.join(directory, name), Buffer.from(dataUrl.slice(PNG_DATA_URL_PREFIX.length), 'base64'));
  return name;
}
