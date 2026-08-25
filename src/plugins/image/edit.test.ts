import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { saveImageEdit } from './edit.js';

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;
const SOURCE_NAME = 'photo.jpg';

function temporaryImage(): string {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'janus-image-edit-')), SOURCE_NAME);
  writeFileSync(file, Buffer.alloc(8));
  return file;
}

describe('saveImageEdit', () => {
  it('replaces the source with the edited PNG and returns its basename', () => {
    const source = temporaryImage();

    const name = saveImageEdit(source, PNG_DATA_URL);

    expect(name).toBe(SOURCE_NAME);
    expect(readFileSync(source)).toEqual(Buffer.from(PNG_BASE64, 'base64'));
    expect(readdirSync(path.dirname(source))).toEqual([SOURCE_NAME]);
  });

  it('replaces the same source on every save without creating an edited sibling', () => {
    const source = temporaryImage();

    expect(saveImageEdit(source, PNG_DATA_URL)).toBe(SOURCE_NAME);
    expect(saveImageEdit(source, PNG_DATA_URL)).toBe(SOURCE_NAME);

    expect(readFileSync(source)).toEqual(Buffer.from(PNG_BASE64, 'base64'));
    expect(readdirSync(path.dirname(source))).toEqual([SOURCE_NAME]);
  });

  it('rejects anything that is not a PNG data URL without replacing the source', () => {
    const source = temporaryImage();
    const before = readFileSync(source);
    for (const payload of ['data:image/jpeg;base64,abcd', 'not-a-data-url', '', PNG_BASE64]) {
      expect(() => saveImageEdit(source, payload)).toThrow(/expected a PNG data URL/u);
    }
    expect(readFileSync(source)).toEqual(before);
    expect(readdirSync(path.dirname(source))).toEqual([SOURCE_NAME]);
  });

  it('surfaces filesystem write failures', () => {
    expect(() => saveImageEdit('/no/such/directory/photo.jpg', PNG_DATA_URL)).toThrow();
  });
});
