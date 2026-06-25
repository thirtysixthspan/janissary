import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openerForExtension, openers } from './index.js';
import { opener as image } from './image.js';
import type { OpenContext, ImageView } from './index.js';

// A capturing OpenContext for exercising openers without a controller.
function fakeContext(overrides: Partial<OpenContext> = {}) {
  const notes: string[] = [];
  const opened: ImageView[] = [];
  const context: OpenContext = {
    note: (t) => { notes.push(t); },
    openImageTab: (v) => { opened.push(v); },
    registerFile: (p) => `/open/test-${p.length}`,
    openExternally: () => true,
    ...overrides,
  };
  return { ctx: context, notes, opened };
}

describe('opener registry', () => {
  it('selects the image opener for an image extension (case-insensitive)', () => {
    expect(openerForExtension('.png')).toBe(image);
    expect(openerForExtension('.JPG')).toBe(image);
    expect(openerForExtension('.svg')).toBe(image);
  });

  it('returns no opener for an unregistered extension', () => {
    expect(openerForExtension('.txt')).toBeUndefined();
    expect(openerForExtension('')).toBeUndefined();
  });

  it('has the image opener registered', () => {
    expect(openers).toContain(image);
  });
});

describe('image opener', () => {
  it('inline builds an image-view payload with metadata and a serve ref', () => {
    const dir = mkdtempSync(join(tmpdir(), 'janus-img-'));
    const file = join(dir, 'diagram.png');
    writeFileSync(file, Buffer.alloc(1500)); // 1500 bytes -> "1.5 KB"
    const { ctx, opened } = fakeContext();
    image.inline(file, ctx);
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({ name: 'diagram.png', path: file, size: '1.5 KB' });
    expect(opened[0].url).toMatch(/^\/open\//);
  });

  it('inline reports an unknown size for a missing file rather than throwing', () => {
    const { ctx, opened } = fakeContext();
    image.inline('/no/such/file.png', ctx);
    expect(opened[0].size).toBe('unknown');
  });

  it('external launches the OS viewer and confirms', () => {
    const { ctx, notes } = fakeContext({ openExternally: () => true });
    image.external('/tmp/x.png', ctx);
    expect(notes[0]).toContain('Opening x.png');
  });

  it('external falls back to reporting the path when no viewer is available', () => {
    const { ctx, notes } = fakeContext({ openExternally: () => false });
    image.external('/tmp/x.png', ctx);
    expect(notes[0]).toContain('/tmp/x.png');
    expect(notes[0]).toContain('No image viewer');
  });
});
