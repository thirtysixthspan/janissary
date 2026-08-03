import { describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  TabPluginRejection, type TabPluginPayload, type TabPluginServerCapabilities,
} from '../api.js';
import { openerForExtension } from '../../openers/index.js';
import { activate } from './activate.js';

function fakeCapabilities(options: {
  player?: string;
  openExternally?: (file: string, application?: string) => boolean;
} = {}) {
  const notes: string[] = [];
  const opened: TabPluginPayload[] = [];
  const keys: string[] = [];
  const claimedOpens: string[] = [];
  const external = vi.fn(options.openExternally ?? (() => true));
  const capabilities: TabPluginServerCapabilities = {
    note: (text) => { notes.push(text); },
    openOrFocusTab: (key, factory) => {
      keys.push(key);
      opened.push(factory({ registerFile: (file) => `/open/ref-${file.length}` }));
    },
    openClaimedFiles: (target) => { claimedOpens.push(target); },
    configuredViewer: () => options.player ?? 'QuickTime Player',
    openExternally: external,
    rejectRequest: (reason): never => { throw new TabPluginRejection(reason); },
    reportFailure: (reason): never => { throw new Error(String(reason)); },
  };
  return { capabilities, claimedOpens, external, keys, notes, opened };
}

describe('video opener registration', () => {
  it('claims video extensions case-insensitively through the generic adapter', () => {
    expect(openerForExtension('.mp4')?.name).toBe('video');
    expect(openerForExtension('.MOV')?.name).toBe('video');
    expect(openerForExtension('.MKV')?.name).toBe('video');
    expect(openerForExtension('.mp3')).toBeUndefined();
  });
});

describe('video plugin opener', () => {
  const opener = activate().opener;

  it('opens playable video metadata and a served-file reference', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-video-'));
    const file = path.join(dir, 'clip.mp4');
    writeFileSync(file, Buffer.alloc(1500));
    const fixture = fakeCapabilities();

    opener.inline(file, fixture.capabilities);

    expect(fixture.keys).toEqual([file]);
    expect(fixture.opened[0]).toMatchObject({
      title: 'clip.mp4',
      payload: {
        name: 'clip.mp4', path: file, size: '1.5 KB', player: 'QuickTime Player',
      },
    });
    expect((fixture.opened[0].payload as { url: string }).url).toMatch(/^\/open\//u);
  });

  it('matches playable extensions case-insensitively', () => {
    const fixture = fakeCapabilities();
    opener.inline('/tmp/clip.MP4', fixture.capabilities);
    expect(fixture.opened).toHaveLength(1);
  });

  it('reports unknown size when the file disappears during opening', () => {
    const fixture = fakeCapabilities();
    opener.inline('/no/such/file.webm', fixture.capabilities);
    expect(fixture.opened[0].payload).toMatchObject({ size: 'unknown' });
  });

  it('routes external-only containers without opening a tab', () => {
    const fixture = fakeCapabilities();
    opener.inline('/tmp/show.mkv', fixture.capabilities);
    expect(fixture.opened).toHaveLength(0);
    expect(fixture.external).toHaveBeenCalledWith('/tmp/show.mkv', 'QuickTime Player');
    expect(fixture.notes).toEqual(['Opening show.mkv in QuickTime Player…']);
  });
});

describe('video plugin external opening', () => {
  const opener = activate().opener;

  it('launches the configured application and confirms it by name', () => {
    const fixture = fakeCapabilities({ player: 'VLC' });
    opener.external('/tmp/clip.mp4', fixture.capabilities);
    expect(fixture.external).toHaveBeenCalledWith('/tmp/clip.mp4', 'VLC');
    expect(fixture.notes).toEqual(['Opening clip.mp4 in VLC…']);
  });

  it('uses the OS default when no application is configured', () => {
    const fixture = fakeCapabilities({ player: '' });
    opener.external('/tmp/clip.mp4', fixture.capabilities);
    expect(fixture.external).toHaveBeenCalledWith('/tmp/clip.mp4');
    expect(fixture.notes[0]).toContain('your default video player');
  });

  it('falls back to the OS default after a named launch fails', () => {
    const fixture = fakeCapabilities({
      openExternally: (_file, application) => application === undefined,
    });
    opener.external('/tmp/clip.mp4', fixture.capabilities);
    expect(fixture.external).toHaveBeenNthCalledWith(1, '/tmp/clip.mp4', 'QuickTime Player');
    expect(fixture.external).toHaveBeenNthCalledWith(2, '/tmp/clip.mp4');
  });

  it('reports the path when no external player launches', () => {
    const fixture = fakeCapabilities({ openExternally: () => false });
    opener.external('/tmp/clip.mp4', fixture.capabilities);
    expect(fixture.notes).toEqual(['No video player available. The file is at /tmp/clip.mp4']);
  });
});

describe('video plugin intents', () => {
  it('writes captures beside only the server-owned tab video path', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-video-intent-'));
    const videoPath = path.join(dir, 'clip.mp4');
    const clientChoice = path.join(dir, 'client-choice.mp4');
    writeFileSync(videoPath, 'video');
    const fixture = fakeCapabilities();

    const result = activate().intent({
      tab: 'video', intent: 'capture-frame',
      payload: { dataUrl: 'data:image/png;base64,AA==', path: clientChoice },
      tabPayload: {
        name: 'clip.mp4', path: videoPath, size: '5 B', url: '/open/allowed', player: '',
      },
    }, fixture.capabilities);

    expect(result).toEqual({ name: 'clip.shot-1.png' });
    expect(existsSync(path.join(dir, 'clip.shot-1.png'))).toBe(true);
    expect(existsSync(path.join(dir, 'client-choice.shot-1.png'))).toBe(false);
  });

  it('answers malformed and unknown intents with a rejection, not a plugin failure', () => {
    const fixture = fakeCapabilities();
    const tabPayload = {
      name: 'clip.mp4', path: '/tmp/clip.mp4', size: '5 B', url: '/open/allowed', player: '',
    };
    for (const [intent, message] of [
      ['capture-frame', 'invalid capture-frame payload'],
      ['open-external', 'invalid open-external payload'],
      ['unknown', 'unknown video intent "unknown"'],
    ]) {
      const payload = intent === 'open-external' ? { unexpected: true } : {};
      expect(() => activate().intent({ tab: 'video', intent, payload, tabPayload }, fixture.capabilities))
        .toThrow(new TabPluginRejection(message));
    }
  });

  // A bad tab payload is the host's own record rather than client input, so it means this plugin
  // produced something invalid — the one video case that should genuinely disable the plugin.
  it('treats an invalid tab payload as a plugin failure rather than a rejection', () => {
    const fixture = fakeCapabilities();
    let thrown: unknown;
    try {
      activate().intent(
        { tab: 'video', intent: 'capture-frame', payload: {}, tabPayload: { nope: true } },
        fixture.capabilities,
      );
    } catch (error) { thrown = error; }
    expect(thrown).not.toBeInstanceOf(TabPluginRejection);
    expect((thrown as Error).message).toBe('invalid video tab payload');
  });
});

describe('video plugin command', () => {
  it('hands the whole argument to the host open pipeline, pinned to its own opener', () => {
    const fixture = fakeCapabilities();
    activate().command?.('~/clips/*.mp4', fixture.capabilities);
    expect(fixture.claimedOpens).toEqual(['~/clips/*.mp4']);
    expect(fixture.opened).toEqual([]);
  });

  it('rejects a bare command with usage instead of disabling the plugin', () => {
    const fixture = fakeCapabilities();
    expect(() => activate().command?.('', fixture.capabilities))
      .toThrow(new TabPluginRejection('Usage: video <path>'));
    expect(fixture.claimedOpens).toEqual([]);
  });
});
