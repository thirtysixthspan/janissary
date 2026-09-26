import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { servedContentType } from './content-type.js';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SVG_TYPE = 'image/svg+xml';

function temporaryFile(name: string, bytes: Buffer | string): string {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'janus-content-type-')), name);
  writeFileSync(file, bytes);
  return file;
}

describe('servedContentType', () => {
  it('serves an image whose bytes are a PNG as a PNG, whatever its extension', async () => {
    const file = temporaryFile('vector.svg', Buffer.concat([PNG_SIGNATURE, Buffer.alloc(16)]));
    expect(await servedContentType(file, SVG_TYPE)).toBe('image/png');
    expect(await servedContentType(file, 'image/jpeg')).toBe('image/png');
  });

  it('keeps the extension type for an image whose bytes are not a PNG', async () => {
    const file = temporaryFile('vector.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
    expect(await servedContentType(file, SVG_TYPE)).toBe(SVG_TYPE);
  });

  it('keeps the extension type for a file shorter than the signature', async () => {
    const file = temporaryFile('tiny.svg', PNG_SIGNATURE.subarray(0, 4));
    expect(await servedContentType(file, SVG_TYPE)).toBe(SVG_TYPE);
  });

  it('never sniffs a file whose extension type is not an image', async () => {
    const file = temporaryFile('notes.txt', PNG_SIGNATURE);
    expect(await servedContentType(file, 'text/plain; charset=utf-8')).toBe('text/plain; charset=utf-8');
  });

  it('falls back to the extension type when the file cannot be read', async () => {
    expect(await servedContentType('/no/such/directory/vector.svg', SVG_TYPE)).toBe(SVG_TYPE);
  });
});
