import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openerForExtension, openers } from './index.js';
import { opener as editor, openInEditor, EDITOR_MAX_BYTES } from './editor.js';
import { opener as markdown } from './markdown.js';
import type { OpenContext } from './index.js';
import type { EditorView } from '../types.js';

function fakeContext(overrides: Partial<OpenContext> = {}) {
  const notes: string[] = [];
  const opened: EditorView[] = [];
  const context: OpenContext = {
    note: (t) => { notes.push(t); },
    openImageTab: () => {},
    openMarkdownTab: () => {},
    openEditorTab: (v) => { opened.push(v); },
    openPageTab: () => {},
    registerFile: (p) => `/open/test-${p.length}`,
    openExternally: () => true,
    ...overrides,
  };
  return { ctx: context, notes, opened };
}

function temporaryFile(name: string, content: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'janus-editor-'));
  const file = path.join(dir, name);
  writeFileSync(file, content);
  return file;
}

describe('opener registry', () => {
  it('selects the editor opener for plain-text extensions (case-insensitive)', () => {
    expect(openerForExtension('.txt')).toBe(editor);
    expect(openerForExtension('.TS')).toBe(editor);
    expect(openerForExtension('.yaml')).toBe(editor);
  });

  it('leaves markdown to the markdown opener', () => {
    expect(openerForExtension('.md')).toBe(markdown);
  });

  it('has the editor opener registered', () => {
    expect(openers).toContain(editor);
  });
});

describe('editor opener', () => {
  it('inline builds an editor-view payload with metadata and a serve ref', () => {
    const file = temporaryFile('notes.txt', 'hello\n');
    const { ctx, opened } = fakeContext();
    editor.inline(file, ctx);
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({ name: 'notes.txt', path: file });
    expect(opened[0].url).toMatch(/^\/open\//);
  });

  it('inline reports an unknown size for a missing file rather than throwing', () => {
    const { ctx, opened } = fakeContext();
    editor.inline('/no/such/file.txt', ctx);
    expect(opened[0].size).toBe('unknown');
  });

  it('refuses files above the size ceiling', () => {
    const file = temporaryFile('big.txt', 'x'.repeat(EDITOR_MAX_BYTES + 1));
    const { ctx, notes, opened } = fakeContext();
    editor.inline(file, ctx);
    expect(opened).toHaveLength(0);
    expect(notes[0]).toContain('too large');
  });

  it('openInEditor opens files regardless of extension (the edit command path)', () => {
    const file = temporaryFile('Makefile', 'all:\n');
    const { ctx, opened } = fakeContext();
    openInEditor(file, ctx);
    expect(opened[0]).toMatchObject({ name: 'Makefile', path: file });
  });

  it('openInEditor includes a target line when given one', () => {
    const file = temporaryFile('notes.txt', 'hello\n');
    const { ctx, opened } = fakeContext();
    openInEditor(file, ctx, 42);
    expect(opened[0].line).toBe(42);
  });

  it('openInEditor leaves line undefined when none is given', () => {
    const file = temporaryFile('notes.txt', 'hello\n');
    const { ctx, opened } = fakeContext();
    openInEditor(file, ctx);
    expect(opened[0].line).toBeUndefined();
  });

  it('external launches the OS viewer and confirms', () => {
    const { ctx, notes } = fakeContext({ openExternally: () => true });
    void editor.external('/tmp/notes.txt', ctx);
    expect(notes[0]).toContain('Opening notes.txt');
  });

  it('external falls back to reporting the path when no viewer is available', () => {
    const { ctx, notes } = fakeContext({ openExternally: () => false });
    void editor.external('/tmp/notes.txt', ctx);
    expect(notes[0]).toContain('/tmp/notes.txt');
    expect(notes[0]).toContain('No viewer available');
  });
});
