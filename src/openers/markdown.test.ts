import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openerForExtension, openers } from './index.js';
import { opener as markdown } from './markdown.js';
import type { OpenContext, ImageView } from './index.js';
import type { MarkdownView } from '../types.js';

function fakeContext(overrides: Partial<OpenContext> = {}) {
  const notes: string[] = [];
  const opened: MarkdownView[] = [];
  const context: OpenContext = {
    note: (t) => { notes.push(t); },
    openImageTab: (_v: ImageView) => {},
    openMarkdownTab: (v) => { opened.push(v); },
    openEditorTab: () => {},
    registerFile: (p) => `/open/test-${p.length}`,
    openExternally: () => true,
    openPageTab: () => {},
    ...overrides,
  };
  return { ctx: context, notes, opened };
}

describe('opener registry', () => {
  it('selects the markdown opener for .md (case-insensitive)', () => {
    expect(openerForExtension('.md')).toBe(markdown);
    expect(openerForExtension('.MD')).toBe(markdown);
  });

  it('selects the markdown opener for .markdown', () => {
    expect(openerForExtension('.markdown')).toBe(markdown);
    expect(openerForExtension('.MARKDOWN')).toBe(markdown);
  });

  it('has the markdown opener registered', () => {
    expect(openers).toContain(markdown);
  });
});

describe('markdown opener', () => {
  it('inline builds a markdown-view payload with metadata and a serve ref', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-md-'));
    const file = path.join(dir, 'notes.md');
    writeFileSync(file, '# Hello\n');
    const { ctx, opened } = fakeContext();
    markdown.inline(file, ctx);
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({ name: 'notes.md', path: file });
    expect(opened[0].url).toMatch(/^\/open\//);
  });

  it('inline reports an unknown size for a missing file rather than throwing', () => {
    const { ctx, opened } = fakeContext();
    markdown.inline('/no/such/file.md', ctx);
    expect(opened[0].size).toBe('unknown');
  });

  it('external launches the OS viewer and confirms', () => {
    const { ctx, notes } = fakeContext({ openExternally: () => true });
    markdown.external('/tmp/notes.md', ctx);
    expect(notes[0]).toContain('Opening notes.md');
  });

  it('external falls back to reporting the path when no viewer is available', () => {
    const { ctx, notes } = fakeContext({ openExternally: () => false });
    markdown.external('/tmp/notes.md', ctx);
    expect(notes[0]).toContain('/tmp/notes.md');
    expect(notes[0]).toContain('No viewer available');
  });
});
