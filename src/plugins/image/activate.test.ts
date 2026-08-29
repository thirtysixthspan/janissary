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
  const updated: { key: string; payload: unknown }[] = [];
  const external = vi.fn(options.openExternally ?? (() => true));
  const capabilities: TabPluginServerCapabilities = {
    note: (text) => { notes.push(text); },
    openOrFocusTab: (key, factory) => {
      keys.push(key);
      opened.push(factory({ registerFile: (file) => `/open/ref-${file.length}` }));
    },
    updateTab: (key, factory) => {
      updated.push({
        key,
        payload: factory({ registerFile: (file) => `/open/ref-${file.length}` }).payload,
      });
    },
    openClaimedFiles: () => { throw new Error('image declares no command'); },
    configuredViewer: () => { throw new Error('image declares no configured viewer'); },
    openExternally: external,
    rejectRequest: (reason): never => { throw new TabPluginRejection(reason); },
    reportFailure: (reason): never => { throw new Error(String(reason)); },
  };
  return { capabilities, external, keys, notes, opened, updated };
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
    expect(fixture.notes).toEqual(['Opening pic.png in your default image viewer…']);
    expect(fixture.opened).toHaveLength(0);
  });

  it('reports the path when no viewer could be launched', () => {
    const fixture = fakeCapabilities({ openExternally: () => false });
    opener.external('/tmp/pic.png', fixture.capabilities);
    expect(fixture.notes).toEqual(['No image viewer available. The file is at /tmp/pic.png']);
  });
});

describe('image plugin edit presentation', () => {
  const opener = activate().opener;

  it('opens the tab in edit mode under the file-path instance key', () => {
    const file = temporaryImage('diagram.png', 1500);
    const fixture = fakeCapabilities();

    opener.edit!(file, fixture.capabilities);

    expect(fixture.keys).toEqual([file]);
    expect(fixture.opened[0].payload).toMatchObject({ name: 'diagram.png', mode: 'edit' });
  });

  // The same file already open as a viewer is the same tab: `edit` focuses it and flips it through
  // `updateTab` rather than opening a second tab for one image.
  it('carries the mode across to an already-open viewer through updateTab', () => {
    const file = temporaryImage('diagram.png', 1500);
    const fixture = fakeCapabilities();

    opener.edit!(file, fixture.capabilities);

    expect(fixture.updated).toHaveLength(1);
    expect(fixture.updated[0].key).toBe(file);
    expect(fixture.updated[0].payload).toMatchObject({ mode: 'edit' });
  });

  it('leaves the viewer presentation free of a mode and of any tab update', () => {
    const file = temporaryImage('diagram.png', 1500);
    const fixture = fakeCapabilities();

    opener.inline(file, fixture.capabilities);

    expect(fixture.updated).toHaveLength(0);
    expect(Object.hasOwn(fixture.opened[0].payload as object, 'mode')).toBe(false);
  });
});

describe('image plugin intents', () => {
  const intent = activate().intent;
  const payload = { name: 'pic.png', path: '/tmp/pic.png', size: '1 KB', url: '/open/1' };

  it('writes an edit and returns the name the server chose', () => {
    const file = temporaryImage('pic.png', 8);
    const fixture = fakeCapabilities();

    const result = intent(
      {
        tab: 'image',
        intent: 'save-edit',
        payload: { dataUrl: `data:image/png;base64,${Buffer.alloc(4).toString('base64')}` },
        tabPayload: { ...payload, path: file },
      },
      fixture.capabilities,
    );

    expect(result).toEqual({ name: 'pic.png' });
  });

  it('rejects a malformed save-edit payload without disabling the plugin', () => {
    const fixture = fakeCapabilities();
    expect(() => intent(
      { tab: 'image', intent: 'save-edit', payload: { dataUrl: 42 }, tabPayload: payload },
      fixture.capabilities,
    )).toThrow(TabPluginRejection);
  });

  it('rejects an unknown intent name', () => {
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

  it('accepts the optional edit mode and rejects any other value for it', () => {
    expect(isImagePayload({ ...payload, mode: 'edit' })).toBe(true);
    expect(isImagePayload({ ...payload, mode: 'view' })).toBe(false);
    expect(isImagePayload({ ...payload, mode: 1 })).toBe(false);
  });
});
