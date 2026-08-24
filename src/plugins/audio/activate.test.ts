import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  TabPluginRejection,
  type TabPluginPayload,
  type TabPluginServerCapabilities,
  type TabPluginTabUpdate,
} from '../api.js';
import { openerForExtension, pluginOpeners } from '../../openers/index.js';
import { tabPluginCatalog } from '../catalog.js';
import { pluginContentTypes } from '../opener-adapter.js';
import { activate } from './activate.js';
import { audioManifest } from './manifest.js';
import { AUDIO_TAB_KEY, type AudioPayload } from './shared.js';

// A capability fixture whose tab store behaves the way the host's does: `openOrFocusTab` runs the
// factory only when no tab holds the key, and `updateTab` only when one does. That distinction is
// what the opener reads to tell "open the player" from "append to the playlist it already has".
function fakeCapabilities(options: { player?: string; open?: boolean } = {}) {
  const notes: string[] = [];
  const opened: TabPluginPayload[] = [];
  const updates: TabPluginTabUpdate[] = [];
  const claimedOpens: string[] = [];
  const notices: string[] = [];
  const registered: string[] = [];
  let tabOpen = options.open ?? false;
  const resources = {
    registerFile: (file: string) => { registered.push(file); return `/open/ref-${registered.length}`; },
  };
  const capabilities: TabPluginServerCapabilities = {
    note: (text) => { notes.push(text); },
    notifyUser: (text) => { notices.push(text); },
    openOrFocusTab: (key, factory) => {
      if (key !== AUDIO_TAB_KEY) throw new Error(`unexpected instance key "${key}"`);
      if (tabOpen) return;
      tabOpen = true;
      opened.push(factory(resources));
    },
    updateTab: (key, factory) => {
      if (key !== AUDIO_TAB_KEY) throw new Error(`unexpected instance key "${key}"`);
      if (tabOpen) updates.push(factory(resources));
    },
    openClaimedFiles: (target) => { claimedOpens.push(target); },
    configuredViewer: () => options.player ?? 'Music',
    openExternally: vi.fn(() => true),
    rejectRequest: (reason): never => { throw new TabPluginRejection(reason); },
    reportFailure: (reason): never => { throw new Error(String(reason)); },
  } as unknown as TabPluginServerCapabilities;
  return { capabilities, claimedOpens, notes, notices, opened, registered, updates };
}

function payloadOf(value: TabPluginPayload | TabPluginTabUpdate): AudioPayload {
  return value.payload as AudioPayload;
}

function makeTrack(directory: string, name: string, bytes = 1500): string {
  const file = path.join(directory, name);
  writeFileSync(file, Buffer.alloc(bytes));
  return file;
}

function tabPayload(...names: string[]): AudioPayload {
  return {
    tracks: names.map((name) => ({ name, path: `/music/${name}`, url: `/open/${name}` })),
    current: 0,
    size: '1.5 KB',
  };
}

describe('audio opener registration', () => {
  it('claims audio extensions case-insensitively through the generic adapter', () => {
    expect(openerForExtension('.mp3')?.name).toBe('audio');
    expect(openerForExtension('.FLAC')?.name).toBe('audio');
    expect(openerForExtension('.WMA')?.name).toBe('audio');
    expect(openerForExtension('.mp4')?.name).toBe('video');
  });

  it('claims no extension, command, or content type another bundled plugin already owns', () => {
    const others = tabPluginCatalog.filter((declaration) => declaration.id !== 'audio');
    const taken = new Set(others.flatMap(
      (declaration) => Object.keys(declaration.fileExtensions).map((item) => item.toLowerCase()),
    ));
    for (const extension of Object.keys(audioManifest.fileExtensions)) {
      expect(taken.has(extension.toLowerCase())).toBe(false);
      // Every claim survived conflict rejection, so the opener registry answers with audio itself.
      expect(openerForExtension(extension)?.name).toBe('audio');
    }
    expect(others.map((declaration) => declaration.command)).not.toContain(audioManifest.command);
  });

  it('serves a content type for every extension a browser can decode, and none for the rest', () => {
    const contentTypes = pluginContentTypes(tabPluginCatalog, pluginOpeners);
    expect(contentTypes['.mp3']).toBe('audio/mpeg');
    expect(contentTypes['.opus']).toBe('audio/ogg');
    expect(contentTypes['.wma']).toBeUndefined();
  });
});

describe('audio plugin opener', () => {
  it('opens the player tab under the constant instance key with the file queued', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'janus-audio-'));
    const file = makeTrack(directory, 'one.mp3');
    const fixture = fakeCapabilities();

    activate().opener.inline(file, fixture.capabilities);

    expect(fixture.opened).toHaveLength(1);
    expect(fixture.opened[0].title).toBe('audio');
    expect(payloadOf(fixture.opened[0])).toMatchObject({ current: 0, size: '1.5 KB' });
    expect(payloadOf(fixture.opened[0]).tracks).toEqual([
      { name: 'one.mp3', path: file, url: '/open/ref-1' },
    ]);
  });

  it('appends a second file to the open tab and jumps to it instead of opening another', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'janus-audio-'));
    const first = makeTrack(directory, 'one.mp3');
    const second = makeTrack(directory, 'two.mp3', 3000);
    const fixture = fakeCapabilities();
    const plugin = activate();

    plugin.opener.inline(first, fixture.capabilities);
    plugin.opener.inline(second, fixture.capabilities);

    expect(fixture.opened).toHaveLength(1);
    expect(fixture.updates).toHaveLength(1);
    expect(fixture.registered).toEqual([first, second]);
    expect(fixture.updates[0].title).toBeUndefined();
    const playlist = payloadOf(fixture.updates[0]);
    expect(playlist.tracks.map((entry) => entry.name)).toEqual(['one.mp3', 'two.mp3']);
    expect(playlist.current).toBe(1);
    expect(playlist.size).toBe('2.9 KB');
  });

  it('reports unknown size when the file disappears during opening', () => {
    const fixture = fakeCapabilities();
    activate().opener.inline('/no/such/file.flac', fixture.capabilities);
    expect(payloadOf(fixture.opened[0]).size).toBe('unknown');
  });

  it('routes an extension no browser decodes to the external player without opening a tab', () => {
    const fixture = fakeCapabilities();
    activate().opener.inline('/music/old.wma', fixture.capabilities);
    expect(fixture.opened).toHaveLength(0);
    expect(fixture.capabilities.openExternally).toHaveBeenCalledWith('/music/old.wma', 'Music');
    expect(fixture.notes).toEqual(['Opening old.wma in Music…']);
  });
});

describe('audio plugin external opening', () => {
  it('launches the configured application and confirms it by name', () => {
    const fixture = fakeCapabilities({ player: 'VLC' });
    activate().opener.external('/music/a.mp3', fixture.capabilities);
    expect(fixture.capabilities.openExternally).toHaveBeenCalledWith('/music/a.mp3', 'VLC');
    expect(fixture.notes).toEqual(['Opening a.mp3 in VLC…']);
  });

  it('uses the OS default when no application is configured', () => {
    const fixture = fakeCapabilities({ player: '' });
    activate().opener.external('/music/a.mp3', fixture.capabilities);
    expect(fixture.capabilities.openExternally).toHaveBeenCalledWith('/music/a.mp3');
    expect(fixture.notes[0]).toContain('your default audio player');
  });

  it('falls back to the OS default after a named launch fails', () => {
    const fixture = fakeCapabilities();
    (fixture.capabilities.openExternally as ReturnType<typeof vi.fn>)
      .mockImplementation((_file: string, application?: string) => application === undefined);
    activate().opener.external('/music/a.mp3', fixture.capabilities);
    expect(fixture.capabilities.openExternally).toHaveBeenNthCalledWith(1, '/music/a.mp3', 'Music');
    expect(fixture.capabilities.openExternally).toHaveBeenNthCalledWith(2, '/music/a.mp3');
  });

  it('reports the path when no external player launches', () => {
    const fixture = fakeCapabilities();
    (fixture.capabilities.openExternally as ReturnType<typeof vi.fn>).mockReturnValue(false);
    activate().opener.external('/music/a.mp3', fixture.capabilities);
    expect(fixture.notes).toEqual(['No audio player available. The file is at /music/a.mp3']);
  });
});

describe('audio plugin command and selection action', () => {
  it('hands the whole argument to the host open pipeline, pinned to its own opener', () => {
    const fixture = fakeCapabilities();
    activate().command?.('~/music/*.mp3', fixture.capabilities);
    expect(fixture.claimedOpens).toEqual(['~/music/*.mp3']);
    expect(fixture.opened).toEqual([]);
  });

  it('rejects a bare command with usage instead of disabling the plugin', () => {
    const fixture = fakeCapabilities();
    expect(() => activate().command?.('', fixture.capabilities))
      .toThrow(new TabPluginRejection('Usage: audio <path>'));
    expect(fixture.claimedOpens).toEqual([]);
  });

  it('queues every path the selection action is given, in the order it was given them', () => {
    const fixture = fakeCapabilities();
    activate().selectionAction?.(['/music/a.mp3', '/music/b.mp3'], fixture.capabilities);
    expect(fixture.claimedOpens).toEqual(['/music/a.mp3', '/music/b.mp3']);
  });
});

describe('audio plugin intents', () => {
  it('makes a queued track current without retitling the tab', () => {
    const fixture = fakeCapabilities({ open: true });
    const result = activate().intent({
      tab: 'audio', intent: 'select-track', payload: { path: '/music/b.mp3' },
      tabPayload: tabPayload('a.mp3', 'b.mp3'),
    }, fixture.capabilities);

    expect(result).toBeNull();
    expect(fixture.updates[0].title).toBeUndefined();
    expect(payloadOf(fixture.updates[0]).current).toBe(1);
  });

  it('drops a track and advances without retitling the tab', () => {
    const fixture = fakeCapabilities({ open: true });
    activate().intent({
      tab: 'audio', intent: 'remove-track', payload: { path: '/music/a.mp3' },
      tabPayload: tabPayload('a.mp3', 'b.mp3'),
    }, fixture.capabilities);

    expect(fixture.updates[0].title).toBeUndefined();
    expect(payloadOf(fixture.updates[0]).tracks.map((entry) => entry.name)).toEqual(['b.mp3']);
    expect(fixture.notices).toEqual([]);
  });

  it('names a dropped undecodable track in the notifications feed and nowhere else', () => {
    const fixture = fakeCapabilities({ open: true });
    activate().intent({
      tab: 'audio', intent: 'remove-track', payload: { path: '/music/a.mp3', unplayable: true },
      tabPayload: tabPayload('a.mp3', 'b.mp3'),
    }, fixture.capabilities);

    expect(fixture.notices).toEqual(['Dropped a.mp3 — it could not be played.']);
    expect(fixture.notes).toEqual([]);
    expect(payloadOf(fixture.updates[0]).tracks.map((entry) => entry.name)).toEqual(['b.mp3']);
  });

  it.each([
    ['select-track', 'select-track names no queued track'],
    ['remove-track', 'remove-track names no queued track'],
  ])('rejects %s for a path the tab playlist does not hold', (intent, message) => {
    const fixture = fakeCapabilities({ open: true });
    expect(() => activate().intent(
      { tab: 'audio', intent, payload: { path: '/music/z.mp3' }, tabPayload: tabPayload('a.mp3') },
      fixture.capabilities,
    )).toThrow(new TabPluginRejection(message));
    expect(fixture.updates).toEqual([]);
  });

  it.each([
    ['select-track', {}, 'invalid select-track payload'],
    ['remove-track', { path: 1 }, 'invalid remove-track payload'],
    ['shuffle', { path: '/music/a.mp3' }, 'unknown audio intent "shuffle"'],
  ])('answers %s with a rejection rather than a plugin failure', (intent, payload, message) => {
    const fixture = fakeCapabilities({ open: true });
    expect(() => activate().intent(
      { tab: 'audio', intent, payload, tabPayload: tabPayload('a.mp3') }, fixture.capabilities,
    )).toThrow(new TabPluginRejection(message));
  });

  // A bad tab payload is the host's own record rather than client input, so it means this plugin
  // produced something invalid — the one audio case that should genuinely disable the plugin.
  it('treats an invalid tab payload as a plugin failure rather than a rejection', () => {
    const fixture = fakeCapabilities({ open: true });
    let thrown: unknown;
    try {
      activate().intent(
        { tab: 'audio', intent: 'select-track', payload: {}, tabPayload: { nope: true } },
        fixture.capabilities,
      );
    } catch (error) { thrown = error; }
    expect(thrown).not.toBeInstanceOf(TabPluginRejection);
    expect((thrown as Error).message).toBe('invalid audio tab payload');
  });
});
