import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { nextShotName, saveVideoShot } from './shot.js';

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;

describe('nextShotName', () => {
  it('numbers from 1 in an empty directory', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-shot-'));
    expect(nextShotName(dir, 'clip.mp4')).toBe('clip.shot-1.png');
  });

  it('skips existing shots and reuses a freed number', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-shot-'));
    writeFileSync(path.join(dir, 'clip.shot-1.png'), '');
    writeFileSync(path.join(dir, 'clip.shot-2.png'), '');
    expect(nextShotName(dir, 'clip.mp4')).toBe('clip.shot-3.png');
    rmSync(path.join(dir, 'clip.shot-1.png'));
    expect(nextShotName(dir, 'clip.mp4')).toBe('clip.shot-1.png');
  });

  it('strips only the final extension and handles no extension', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-shot-'));
    expect(nextShotName(dir, 'my.clip.mp4')).toBe('my.clip.shot-1.png');
    expect(nextShotName(dir, 'recording')).toBe('recording.shot-1.png');
  });
});

describe('saveVideoShot', () => {
  it('writes decoded PNG bytes beside the server-owned video path', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-shot-'));
    const videoPath = path.join(dir, 'clip.mp4');
    writeFileSync(videoPath, Buffer.alloc(8));

    const name = saveVideoShot(videoPath, PNG_DATA_URL);

    expect(name).toBe('clip.shot-1.png');
    expect(readFileSync(path.join(dir, name))).toEqual(Buffer.from(PNG_BASE64, 'base64'));
    expect(saveVideoShot(videoPath, PNG_DATA_URL)).toBe('clip.shot-2.png');
  });

  it('rejects non-PNG payloads without writing a shot', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-shot-'));
    const videoPath = path.join(dir, 'clip.mp4');
    writeFileSync(videoPath, Buffer.alloc(8));
    for (const payload of ['data:image/jpeg;base64,abcd', 'not-a-data-url', '', PNG_BASE64]) {
      expect(() => saveVideoShot(videoPath, payload)).toThrow(/expected a PNG data URL/u);
    }
    expect(readdirSync(dir)).toEqual(['clip.mp4']);
  });

  it('surfaces filesystem write failures', () => {
    expect(() => saveVideoShot('/no/such/directory/clip.mp4', PNG_DATA_URL)).toThrow();
  });
});
