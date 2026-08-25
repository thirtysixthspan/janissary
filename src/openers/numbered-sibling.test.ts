import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { nextNumberedSibling, writePngSibling } from './numbered-sibling.js';

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;

function temporaryDirectory(): string {
  return mkdtempSync(path.join(tmpdir(), 'janus-sibling-'));
}

describe('nextNumberedSibling', () => {
  it('numbers from 1 in an empty directory', () => {
    const dir = temporaryDirectory();
    expect(nextNumberedSibling(dir, 'clip.mp4', 'shot')).toBe('clip.shot-1.png');
    expect(nextNumberedSibling(dir, 'photo.jpg', 'edit')).toBe('photo.edit-1.png');
  });

  it('takes the lowest free number, skipping names already on disk', () => {
    const dir = temporaryDirectory();
    writeFileSync(path.join(dir, 'photo.edit-1.png'), '');
    writeFileSync(path.join(dir, 'photo.edit-2.png'), '');
    expect(nextNumberedSibling(dir, 'photo.jpg', 'edit')).toBe('photo.edit-3.png');
  });

  it('frees a deleted number for reuse', () => {
    const dir = temporaryDirectory();
    writeFileSync(path.join(dir, 'photo.edit-1.png'), '');
    writeFileSync(path.join(dir, 'photo.edit-2.png'), '');
    rmSync(path.join(dir, 'photo.edit-1.png'));
    expect(nextNumberedSibling(dir, 'photo.jpg', 'edit')).toBe('photo.edit-1.png');
  });

  // One numbering rule, two tokens: a `shot` name and an `edit` name come off the same code path,
  // and neither counts the other's files.
  it('keeps the two tokens independent in the same directory', () => {
    const dir = temporaryDirectory();
    writeFileSync(path.join(dir, 'photo.shot-1.png'), '');
    expect(nextNumberedSibling(dir, 'photo.jpg', 'shot')).toBe('photo.shot-2.png');
    expect(nextNumberedSibling(dir, 'photo.jpg', 'edit')).toBe('photo.edit-1.png');
  });

  it('strips only the final extension and handles no extension', () => {
    const dir = temporaryDirectory();
    expect(nextNumberedSibling(dir, 'my.clip.mp4', 'shot')).toBe('my.clip.shot-1.png');
    expect(nextNumberedSibling(dir, 'recording', 'shot')).toBe('recording.shot-1.png');
  });
});

describe('writePngSibling', () => {
  it('writes decoded PNG bytes beside the source path and returns the basename', () => {
    const dir = temporaryDirectory();
    const source = path.join(dir, 'photo.jpg');
    writeFileSync(source, Buffer.alloc(8));

    const name = writePngSibling(source, PNG_DATA_URL, 'edit', 'image edit');

    expect(name).toBe('photo.edit-1.png');
    expect(readFileSync(path.join(dir, name))).toEqual(Buffer.from(PNG_BASE64, 'base64'));
  });

  it('names the caller in the rejection and writes nothing for a non-PNG payload', () => {
    const dir = temporaryDirectory();
    const source = path.join(dir, 'photo.jpg');
    writeFileSync(source, Buffer.alloc(8));

    expect(() => writePngSibling(source, 'data:image/jpeg;base64,abcd', 'edit', 'image edit'))
      .toThrow('image edit expected a PNG data URL');
    expect(readdirSync(dir)).toEqual(['photo.jpg']);
  });
});
