import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  TabPluginRejection, type TabPluginPayload, type TabPluginServerCapabilities,
} from '../api.js';
import { openerForExtension } from '../../openers/index.js';
import { activate } from './activate.js';
import { isMarkdownPayload } from './shared.js';

function fakeCapabilities(options: { openExternally?: (file: string) => boolean } = {}) {
  const notes: string[] = [];
  const opened: TabPluginPayload[] = [];
  const keys: string[] = [];
  const references: string[] = [];
  const external = vi.fn(options.openExternally ?? (() => true));
  const capabilities: TabPluginServerCapabilities = {
    note: (text) => { notes.push(text); },
    openOrFocusTab: (key, factory) => {
      if (keys.includes(key)) return;
      keys.push(key);
      opened.push(factory({
        registerFile: (file) => {
          references.push(file);
          return `/open/ref-${references.length}`;
        },
      }));
    },
    openClaimedFiles: () => { throw new Error('markdown declares no command'); },
    configuredViewer: () => { throw new Error('markdown declares no configured viewer'); },
    openExternally: external,
    rejectRequest: (reason): never => { throw new TabPluginRejection(reason); },
    reportFailure: (reason): never => { throw new Error(String(reason)); },
  };
  return { capabilities, external, keys, notes, opened, references };
}

function temporaryMarkdown(name: string, bytes: number): string {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'janus-markdown-')), name);
  writeFileSync(file, '#'.repeat(bytes));
  return file;
}

describe('markdown opener registration', () => {
  it('claims markdown extensions case-insensitively through the generic adapter', () => {
    expect(openerForExtension('.md')?.name).toBe('markdown');
    expect(openerForExtension('.MARKDOWN')?.name).toBe('markdown');
    expect(openerForExtension('.mdx')).toBeUndefined();
  });
});

describe('markdown plugin opener', () => {
  const opener = activate().opener;

  it('opens file metadata and a served-file reference keyed by path', () => {
    const file = temporaryMarkdown('readme.md', 1500);
    const fixture = fakeCapabilities();

    opener.inline(file, fixture.capabilities);

    expect(fixture.keys).toEqual([file]);
    expect(fixture.opened[0]).toMatchObject({
      title: 'readme.md',
      payload: { name: 'readme.md', path: file, size: '1.5 KB' },
    });
    expect((fixture.opened[0].payload as { url: string }).url).toMatch(/^\/open\//u);
  });

  it('focuses the tab already showing a file instead of registering it twice', () => {
    const file = temporaryMarkdown('notes.md', 10);
    const fixture = fakeCapabilities();

    opener.inline(file, fixture.capabilities);
    opener.inline(file, fixture.capabilities);

    expect(fixture.keys).toEqual([file]);
    expect(fixture.references).toEqual([file]);
  });

  it('reports unknown size when the file disappears during opening', () => {
    const fixture = fakeCapabilities();
    opener.inline('/no/such/notes.md', fixture.capabilities);
    expect(fixture.opened[0].payload).toMatchObject({ size: 'unknown' });
  });

  it('hands the file to the OS viewer and confirms, without opening a tab', () => {
    const fixture = fakeCapabilities();
    opener.external('/tmp/notes.md', fixture.capabilities);
    expect(fixture.external).toHaveBeenCalledWith('/tmp/notes.md');
    expect(fixture.notes).toEqual(['Opening notes.md in your default viewer…']);
    expect(fixture.opened).toHaveLength(0);
  });

  it('reports the path when no viewer could be launched', () => {
    const fixture = fakeCapabilities({ openExternally: () => false });
    opener.external('/tmp/notes.md', fixture.capabilities);
    expect(fixture.notes).toEqual(['No viewer available. The file is at /tmp/notes.md']);
  });
});

describe('markdown plugin intents', () => {
  const intent = activate().intent;
  const payload = { name: 'notes.md', path: '/tmp/notes.md', size: '1 KB', url: '/open/1' };

  it('rejects every intent, since the view answers none', () => {
    const fixture = fakeCapabilities();
    expect(() => intent(
      { tab: 'markdown', intent: 'reload', payload: {}, tabPayload: payload },
      fixture.capabilities,
    )).toThrow(TabPluginRejection);
  });

  it('reports a failure when the authoritative tab payload is not its own', () => {
    const fixture = fakeCapabilities();
    expect(() => intent(
      { tab: 'markdown', intent: 'anything', payload: {}, tabPayload: { name: 'notes.md' } },
      fixture.capabilities,
    )).toThrow('invalid markdown tab payload');
  });
});

describe('isMarkdownPayload', () => {
  const payload = { name: 'notes.md', path: '/tmp/notes.md', size: '1 KB', url: '/open/1' };

  it('accepts a complete payload', () => {
    expect(isMarkdownPayload(payload)).toBe(true);
  });

  it('rejects a non-object, null, and an array', () => {
    expect(isMarkdownPayload('notes.md')).toBe(false);
    expect(isMarkdownPayload(null)).toBe(false);
    expect(isMarkdownPayload([payload])).toBe(false);
  });

  it('rejects a payload missing any required field', () => {
    for (const key of Object.keys(payload)) {
      expect(isMarkdownPayload({ ...payload, [key]: undefined })).toBe(false);
    }
  });
});
