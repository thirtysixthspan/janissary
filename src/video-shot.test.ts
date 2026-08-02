import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { nextShotName, saveVideoShot } from './video-shot.js';
import type { Managers } from './managers.js';

// One-pixel PNG, base64-encoded — enough to prove the payload is decoded and written verbatim.
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;

function makeManagers(videoPath: string | undefined): Managers {
  return {
    tab: { openFilePath: (id: string) => (id === 'v1' ? videoPath : undefined) },
  } as unknown as Managers;
}

describe('nextShotName', () => {
  it('numbers from 1 in an empty directory', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-shot-'));
    expect(nextShotName(dir, 'clip.mp4')).toBe('clip.shot-1.png');
  });

  it('skips past shots that already exist', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-shot-'));
    writeFileSync(path.join(dir, 'clip.shot-1.png'), '');
    writeFileSync(path.join(dir, 'clip.shot-2.png'), '');
    expect(nextShotName(dir, 'clip.mp4')).toBe('clip.shot-3.png');
  });

  it('reuses a number freed by a deleted shot', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-shot-'));
    writeFileSync(path.join(dir, 'clip.shot-1.png'), '');
    writeFileSync(path.join(dir, 'clip.shot-2.png'), '');
    rmSync(path.join(dir, 'clip.shot-1.png'));
    expect(nextShotName(dir, 'clip.mp4')).toBe('clip.shot-1.png');
  });

  it('strips only the final extension', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-shot-'));
    expect(nextShotName(dir, 'my.clip.mp4')).toBe('my.clip.shot-1.png');
  });

  it('handles a video with no extension at all', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-shot-'));
    expect(nextShotName(dir, 'recording')).toBe('recording.shot-1.png');
  });
});

describe('saveVideoShot', () => {
  it('writes the decoded PNG beside the video and returns the basename', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-shot-'));
    const videoPath = path.join(dir, 'clip.mp4');
    writeFileSync(videoPath, Buffer.alloc(8));

    const name = saveVideoShot(makeManagers(videoPath), '/open/v1', PNG_DATA_URL);

    expect(name).toBe('clip.shot-1.png');
    expect(readFileSync(path.join(dir, name))).toEqual(Buffer.from(PNG_BASE64, 'base64'));
  });

  it('writes a second capture to a new name rather than overwriting the first', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-shot-'));
    const videoPath = path.join(dir, 'clip.mp4');
    writeFileSync(videoPath, Buffer.alloc(8));
    const managers = makeManagers(videoPath);

    expect(saveVideoShot(managers, '/open/v1', PNG_DATA_URL)).toBe('clip.shot-1.png');
    expect(saveVideoShot(managers, '/open/v1', PNG_DATA_URL)).toBe('clip.shot-2.png');
  });

  it('throws on a ref that is not in the open-file allow-list', () => {
    expect(() => saveVideoShot(makeManagers(undefined), '/open/nope', PNG_DATA_URL))
      .toThrow(/unknown file ref/);
  });

  it('throws on a ref that is not an /open/ path at all', () => {
    expect(() => saveVideoShot(makeManagers('/tmp/clip.mp4'), '/etc/passwd', PNG_DATA_URL))
      .toThrow(/unknown file ref/);
  });

  it('rejects a payload that is not a PNG data URL, writing nothing', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-shot-'));
    const videoPath = path.join(dir, 'clip.mp4');
    writeFileSync(videoPath, Buffer.alloc(8));
    const managers = makeManagers(videoPath);

    for (const payload of ['data:image/jpeg;base64,abcd', 'not-a-data-url', '', PNG_BASE64]) {
      expect(() => saveVideoShot(managers, '/open/v1', payload)).toThrow(/expected a PNG data URL/);
    }

    expect(readdirSync(dir)).toEqual(['clip.mp4']);
  });
});
