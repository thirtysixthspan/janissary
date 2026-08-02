import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { OpenPluginTabRequest, TabPluginServerCapabilities } from '../../api.js';
import { openerForExtension } from '../../../openers/index.js';
import { activate } from './activate.js';

function makeCapabilities() {
  const notes: string[] = [];
  const requests: OpenPluginTabRequest[] = [];
  const openExternally = vi.fn<(file: string, application?: string) => boolean>(() => true);
  const capabilities: TabPluginServerCapabilities = {
    report: (_origin, text) => { notes.push(text); },
    openPluginTab: (request) => { requests.push(request); return { label: 'video', opened: true }; },
    externalViewer: () => 'QuickTime Player',
    openExternally,
  };
  return { activation: activate(capabilities), notes, requests, openExternally };
}

beforeEach(() => { vi.restoreAllMocks(); });

describe('video plugin declaration', () => {
  it('claims playable and external-only containers case-insensitively through the plugin adapter', () => {
    expect(openerForExtension('.MP4')?.plugin?.id).toBe('video');
    expect(openerForExtension('.mkv')?.plugin?.id).toBe('video');
    expect(openerForExtension('.mp3')).toBeUndefined();
  });
});

describe('video plugin opener', () => {
  it('builds a playable tab payload with metadata and one served-file ref', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'janus-video-'));
    const file = path.join(directory, 'clip.mp4');
    writeFileSync(file, Buffer.alloc(1500));
    const { activation, requests } = makeCapabilities();

    await activation.opener!.inline(file, { originLabel: 'janus' });

    expect(requests).toHaveLength(1);
    const payload = requests[0].create({ registerFile: () => '/open/1' });
    expect(payload).toEqual({
      name: 'clip.mp4', path: file, size: '1.5 KB', url: '/open/1', player: 'QuickTime Player',
    });
  });

  it('matches playable extensions case-insensitively and tolerates a disappearing file', async () => {
    const { activation, requests } = makeCapabilities();
    await activation.opener!.inline('/no/such/clip.MP4', { originLabel: 'janus' });
    expect(requests[0].create({ registerFile: () => '/open/1' })).toMatchObject({ size: 'unknown' });
  });

  it('routes external-only containers to the configured player without opening a tab', async () => {
    const { activation, requests, notes, openExternally } = makeCapabilities();
    await activation.opener!.inline('/tmp/show.mkv', { originLabel: 'janus' });
    expect(requests).toHaveLength(0);
    expect(openExternally).toHaveBeenCalledWith('/tmp/show.mkv', 'QuickTime Player');
    expect(notes).toEqual(['Opening show.mkv in QuickTime Player…']);
  });

  it('falls back to the OS handler and then reports an unavailable player', async () => {
    const first = makeCapabilities();
    first.openExternally.mockImplementation((_file, application) => application === undefined);
    await first.activation.opener!.external('/tmp/clip.mp4', { originLabel: 'janus' });
    expect(first.notes).toEqual(['Opening clip.mp4 in your default video player…']);

    const second = makeCapabilities();
    second.openExternally.mockReturnValue(false);
    await second.activation.opener!.external('/tmp/clip.mp4', { originLabel: 'janus' });
    expect(second.notes).toEqual(['No video player available. The file is at /tmp/clip.mp4']);
  });
});

describe('video plugin intents', () => {
  it('rejects a capture when the tab-owned allow-list cannot resolve its ref', () => {
    const { activation } = makeCapabilities();
    expect(() => activation.handleIntent!(
      { tab: 'video', schemaVersion: 1, intent: 'capture-frame', payload: { dataUrl: 'data:image/png;base64,AA==' } },
      {
        tabLabel: 'video', originLabel: 'janus', filePath: (ref) => new Map<string, string>().get(ref),
        tabPayload: { name: 'clip.mp4', path: '/tmp/clip.mp4', size: '1 B', url: '/open/1', player: '' },
      },
    )).toThrow(/unknown file ref/);
  });

  it('returns a valid false result when no external player can open the file', async () => {
    const { activation, openExternally } = makeCapabilities();
    openExternally.mockReturnValue(false);

    const reply = await activation.handleIntent!(
      { tab: 'video', schemaVersion: 1, intent: 'open-external', payload: {} },
      {
        tabLabel: 'video', originLabel: 'janus', filePath: () => '/tmp/clip.mp4',
        tabPayload: { name: 'clip.mp4', path: '/tmp/clip.mp4', size: '1 B', url: '/open/1', player: '' },
      },
    );

    expect(reply.payload).toEqual({ opened: false });
    expect(activation.validateIntentReply?.('open-external', reply.payload)).toBe(true);
  });
});
