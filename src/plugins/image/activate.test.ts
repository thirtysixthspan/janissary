import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  TabPluginRejection, type TabPluginPayload, type TabPluginServerCapabilities,
} from '../api.js';
import { openerForExtension } from '../../openers/index.js';
import { activate } from './activate.js';
import { isImagePayload } from './shared.js';

function fakeCapabilities(options: { openExternally?: (file: string) => boolean } = {}) {
  const notes: string[] = [];
  const opened: TabPluginPayload[] = [];
  const keys: string[] = [];
  const external = vi.fn(options.openExternally ?? (() => true));
  const capabilities: TabPluginServerCapabilities = {
    note: (text) => { notes.push(text); },
    openOrFocusTab: (key, factory) => {
      keys.push(key);
      opened.push(factory({ registerFile: (file) => `/open/ref-${file.length}` }));
    },
    openClaimedFiles: () => { throw new Error('image declares no command'); },
    configuredViewer: () => { throw new Error('image declares no configured viewer'); },
    openExternally: external,
    rejectRequest: (reason): never => { throw new TabPluginRejection(reason); },
    reportFailure: (reason): never => { throw new Error(String(reason)); },
  };
  return { capabilities, external, keys, notes, opened };
}

function temporaryImage(name: string, bytes: number): string {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'janus-image-')), name);
  writeFileSync(file, Buffer.alloc(bytes));
  return file;
}

describe('image opener registration', () => {
  it('claims image extensions case-insensitively through the generic adapter', () => {
    expect(openerForExtension('.png')?.name).toBe('image');
    expect(openerForExtension('.JPEG')?.name).toBe('image');
    expect(openerForExtension('.svg')?.name).toBe('image');
    expect(openerForExtension('.psd')).toBeUndefined();
  });
});

describe('image plugin opener', () => {
  const opener = activate().opener;

  it('opens image metadata and a served-file reference keyed by path', () => {
    const file = temporaryImage('diagram.png', 1500);
    const fixture = fakeCapabilities();

    opener.inline(file, fixture.capabilities);

    expect(fixture.keys).toEqual([file]);
    expect(fixture.opened[0]).toMatchObject({
      title: 'diagram.png',
      payload: { name: 'diagram.png', path: file, size: '1.5 KB' },
    });
    expect((fixture.opened[0].payload as { url: string }).url).toMatch(/^\/open\//u);
  });

  it('reports unknown size when the file disappears during opening', () => {
    const fixture = fakeCapabilities();
    opener.inline('/no/such/pic.png', fixture.capabilities);
    expect(fixture.opened[0].payload).toMatchObject({ size: 'unknown' });
  });

  it('hands the file to the OS viewer and confirms, without opening a tab', () => {
    const fixture = fakeCapabilities();
    opener.external('/tmp/pic.png', fixture.capabilities);
    expect(fixture.external).toHaveBeenCalledWith('/tmp/pic.png');
    expect(fixture.notes).toEqual(['Opening pic.png in your image viewer…']);
    expect(fixture.opened).toHaveLength(0);
  });

  it('reports the path when no viewer could be launched', () => {
    const fixture = fakeCapabilities({ openExternally: () => false });
    opener.external('/tmp/pic.png', fixture.capabilities);
    expect(fixture.notes).toEqual(['No image viewer available. The file is at /tmp/pic.png']);
  });
});

describe('image plugin intents', () => {
  const intent = activate().intent;
  const payload = { name: 'pic.png', path: '/tmp/pic.png', size: '1 KB', url: '/open/1' };

  it('rejects every intent, since the view answers none', () => {
    const fixture = fakeCapabilities();
    expect(() => intent(
      { tab: 'image', intent: 'capture-frame', payload: {}, tabPayload: payload },
      fixture.capabilities,
    )).toThrow(TabPluginRejection);
  });

  it('reports a failure when the authoritative tab payload is not its own', () => {
    const fixture = fakeCapabilities();
    expect(() => intent(
      { tab: 'image', intent: 'anything', payload: {}, tabPayload: { name: 'pic.png' } },
      fixture.capabilities,
    )).toThrow('invalid image tab payload');
  });
});

describe('isImagePayload', () => {
  const payload = { name: 'pic.png', path: '/tmp/pic.png', size: '1 KB', url: '/open/1' };

  it('accepts a complete payload', () => {
    expect(isImagePayload(payload)).toBe(true);
  });

  it('rejects a non-object, null, and an array', () => {
    expect(isImagePayload('pic.png')).toBe(false);
    expect(isImagePayload(null)).toBe(false);
    expect(isImagePayload([payload])).toBe(false);
  });

  it('rejects a payload missing any required field', () => {
    for (const key of Object.keys(payload)) {
      expect(isImagePayload({ ...payload, [key]: undefined })).toBe(false);
    }
  });
});
