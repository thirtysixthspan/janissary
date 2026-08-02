import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { nextShotName, saveVideoShot } from './shot.js';

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;

describe('nextShotName', () => {
  it('numbers from one, skips occupied names, and reuses a deleted number', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'janus-shot-'));
    expect(nextShotName(directory, 'clip.mp4')).toBe('clip.shot-1.png');
    writeFileSync(path.join(directory, 'clip.shot-1.png'), '');
    writeFileSync(path.join(directory, 'clip.shot-2.png'), '');
    expect(nextShotName(directory, 'clip.mp4')).toBe('clip.shot-3.png');
    rmSync(path.join(directory, 'clip.shot-1.png'));
    expect(nextShotName(directory, 'clip.mp4')).toBe('clip.shot-1.png');
  });

  it('strips only the final extension and handles an extensionless name', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'janus-shot-'));
    expect(nextShotName(directory, 'my.clip.mp4')).toBe('my.clip.shot-1.png');
    expect(nextShotName(directory, 'recording')).toBe('recording.shot-1.png');
  });
});

describe('saveVideoShot', () => {
  it('writes decoded PNG bytes beside the video under successive server-selected names', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'janus-shot-'));
    const video = path.join(directory, 'clip.mp4');
    writeFileSync(video, Buffer.alloc(8));
    expect(saveVideoShot(video, PNG_DATA_URL)).toBe('clip.shot-1.png');
    expect(saveVideoShot(video, PNG_DATA_URL)).toBe('clip.shot-2.png');
    expect(readFileSync(path.join(directory, 'clip.shot-1.png'))).toEqual(Buffer.from(PNG_BASE64, 'base64'));
  });

  it('rejects non-PNG data without writing a shot', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'janus-shot-'));
    const video = path.join(directory, 'clip.mp4');
    writeFileSync(video, Buffer.alloc(8));
    for (const payload of ['data:image/jpeg;base64,abcd', 'not-a-data-url', '', PNG_BASE64]) {
      expect(() => saveVideoShot(video, payload)).toThrow(/expected a PNG data URL/);
    }
    expect(readdirSync(directory)).toEqual(['clip.mp4']);
  });

  it('surfaces filesystem write failures', () => {
    expect(() => saveVideoShot('/missing/directory/clip.mp4', PNG_DATA_URL)).toThrow();
  });
});
