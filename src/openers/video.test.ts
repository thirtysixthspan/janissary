import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { OpenContext } from './types.js';
import type { VideoView } from '../tab/types.js';

const mocks = vi.hoisted(() => ({
  didOsOpen: vi.fn<(file: string, application?: string) => boolean>(() => true),
  config: { externalViewers: { video: 'QuickTime Player' } as Record<string, string> },
}));

vi.mock('./os-open.js', () => ({ didOsOpen: mocks.didOsOpen }));
vi.mock('../config.js', () => ({ getConfig: () => mocks.config }));

const { opener: video } = await import('./video.js');
const { openerForExtension, openers } = await import('./index.js');

// A capturing OpenContext for exercising the opener without a controller.
function fakeContext(overrides: Partial<OpenContext> = {}) {
  const notes: string[] = [];
  const opened: VideoView[] = [];
  const context = {
    note: (t: string) => { notes.push(t); },
    openVideoTab: (v: VideoView) => { opened.push(v); },
    registerFile: (p: string) => `/open/test-${p.length}`,
    openExternally: () => true,
    ...overrides,
  } as OpenContext;
  return { ctx: context, notes, opened };
}

beforeEach(() => {
  mocks.didOsOpen.mockReset();
  mocks.didOsOpen.mockReturnValue(true);
  mocks.config.externalViewers = { video: 'QuickTime Player' };
});

describe('video opener registration', () => {
  it('is registered and claims the video extensions case-insensitively', () => {
    expect(openers).toContain(video);
    expect(openerForExtension('.mp4')).toBe(video);
    expect(openerForExtension('.MOV')).toBe(video);
    expect(openerForExtension('.MKV')).toBe(video);
    expect(openerForExtension('.mp3')).toBeUndefined();
  });
});

describe('video opener inline', () => {
  it('opens a video tab for a playable container with metadata, a serve ref, and the player name', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-video-'));
    const file = path.join(dir, 'clip.mp4');
    writeFileSync(file, Buffer.alloc(1500)); // 1500 bytes -> "1.5 KB"
    const { ctx, opened } = fakeContext();

    video.inline(file, ctx);

    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({
      name: 'clip.mp4', path: file, size: '1.5 KB', player: 'QuickTime Player',
    });
    expect(opened[0].url).toMatch(/^\/open\//);
  });

  it('matches the playable set case-insensitively', () => {
    const { ctx, opened } = fakeContext();
    video.inline('/tmp/clip.MP4', ctx);
    expect(opened).toHaveLength(1);
  });

  it('reports an unknown size for a missing file rather than throwing', () => {
    const { ctx, opened } = fakeContext();
    video.inline('/no/such/file.webm', ctx);
    expect(opened[0].size).toBe('unknown');
  });

  it('launches the external player for a container the browser cannot decode, opening no tab', () => {
    const { ctx, opened, notes } = fakeContext();

    video.inline('/tmp/show.mkv', ctx);

    expect(opened).toHaveLength(0);
    expect(mocks.didOsOpen).toHaveBeenCalledWith('/tmp/show.mkv', 'QuickTime Player');
    expect(notes[0]).toBe('Opening show.mkv in QuickTime Player…');
  });
});

describe('video opener external', () => {
  it('launches the configured application and confirms it by name', () => {
    mocks.config.externalViewers = { video: 'VLC' };
    const { ctx, notes } = fakeContext();

    video.external('/tmp/clip.mp4', ctx);

    expect(mocks.didOsOpen).toHaveBeenCalledWith('/tmp/clip.mp4', 'VLC');
    expect(notes[0]).toBe('Opening clip.mp4 in VLC…');
  });

  it('goes straight to the OS default handler when no application is configured', () => {
    mocks.config.externalViewers = {};
    const { ctx, notes } = fakeContext();

    video.external('/tmp/clip.mp4', ctx);

    expect(mocks.didOsOpen).toHaveBeenCalledWith('/tmp/clip.mp4');
    expect(notes[0]).toContain('your default video player');
  });

  it('falls back to the OS default handler when the named launch fails', () => {
    mocks.didOsOpen.mockImplementation((_file, application) => application === undefined);
    const { ctx, notes } = fakeContext();

    video.external('/tmp/clip.mp4', ctx);

    expect(mocks.didOsOpen).toHaveBeenCalledWith('/tmp/clip.mp4', 'QuickTime Player');
    expect(mocks.didOsOpen).toHaveBeenCalledWith('/tmp/clip.mp4');
    expect(notes[0]).toContain('your default video player');
  });

  it('reports the path when neither the named player nor the OS default can be launched', () => {
    mocks.didOsOpen.mockReturnValue(false);
    const { ctx, notes } = fakeContext();

    video.external('/tmp/clip.mp4', ctx);

    expect(notes[0]).toBe('No video player available. The file is at /tmp/clip.mp4');
  });
});
