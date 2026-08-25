import { nextNumberedSibling, writePngSibling } from '../../openers/numbered-sibling.js';

// The next free `<base>.shot-<n>.png` in `dir` for a video named `videoName`, numbering from 1.
export function nextShotName(dir: string, videoName: string): string {
  return nextNumberedSibling(dir, videoName, 'shot');
}

// Write one captured frame beside the server-owned path in the video tab payload.
export function saveVideoShot(videoPath: string, dataUrl: string): string {
  return writePngSibling(videoPath, dataUrl, 'shot', 'video capture');
}
