import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { TabPluginServerCapabilities } from './api.js';
import { audioManifest } from './audio/manifest.js';
import { markdownManifest } from './markdown/manifest.js';
import {
  fileSize, openFileExternally, openFileInConfiguredViewer, servesContentType,
} from './files.js';

// Only the three primitives these helpers compose over. Everything else is left off deliberately: a
// helper reaching for anything more would fail here rather than in whichever plugin adopted it.
function fakeCapabilities(options: { viewer?: string; launches?: boolean } = {}) {
  const notes: string[] = [];
  const openExternally = vi.fn(() => options.launches ?? true);
  const capabilities = {
    note: (text: string) => { notes.push(text); },
    configuredViewer: () => options.viewer ?? '',
    openExternally,
  } as unknown as TabPluginServerCapabilities;
  return { capabilities, notes, openExternally };
}

function temporaryFile(name: string, bytes: number): string {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'janus-plugin-files-')), name);
  writeFileSync(file, Buffer.alloc(bytes));
  return file;
}

describe('fileSize', () => {
  it('renders the file size the way every other size in the app is rendered', () => {
    expect(fileSize(temporaryFile('clip.mp4', 1500))).toBe('1.5 KB');
  });

  it('answers unknown for a path that no longer exists', () => {
    expect(fileSize('/no/such/file.mp4')).toBe('unknown');
  });
});

describe('openFileExternally', () => {
  it('hands the file to the OS and names the default viewer in the confirmation', () => {
    const fixture = fakeCapabilities();

    openFileExternally('/tmp/notes.md', fixture.capabilities, 'viewer');

    expect(fixture.openExternally).toHaveBeenCalledWith('/tmp/notes.md');
    expect(fixture.notes).toEqual(['Opening notes.md in your default viewer…']);
  });

  it('reports the path when nothing launches', () => {
    const fixture = fakeCapabilities({ launches: false });

    openFileExternally('/tmp/notes.md', fixture.capabilities, 'viewer');

    expect(fixture.notes).toEqual(['No viewer available. The file is at /tmp/notes.md']);
  });
});

describe('openFileInConfiguredViewer', () => {
  it('launches the configured application and confirms it by name', () => {
    const fixture = fakeCapabilities({ viewer: 'VLC' });

    openFileInConfiguredViewer('/tmp/clip.mp4', fixture.capabilities, 'video player');

    expect(fixture.openExternally).toHaveBeenCalledWith('/tmp/clip.mp4', 'VLC');
    expect(fixture.notes).toEqual(['Opening clip.mp4 in VLC…']);
  });

  it('goes straight to the OS default when no application is configured', () => {
    const fixture = fakeCapabilities();

    openFileInConfiguredViewer('/tmp/clip.mp4', fixture.capabilities, 'video player');

    expect(fixture.openExternally).toHaveBeenCalledTimes(1);
    expect(fixture.openExternally).toHaveBeenCalledWith('/tmp/clip.mp4');
    expect(fixture.notes).toEqual(['Opening clip.mp4 in your default video player…']);
  });

  it('falls back to the OS default after a named launch fails', () => {
    const fixture = fakeCapabilities({ viewer: 'VLC' });
    fixture.openExternally.mockImplementation(
      (...args: unknown[]) => args[1] === undefined,
    );

    openFileInConfiguredViewer('/tmp/clip.mp4', fixture.capabilities, 'video player');

    expect(fixture.openExternally).toHaveBeenNthCalledWith(1, '/tmp/clip.mp4', 'VLC');
    expect(fixture.openExternally).toHaveBeenNthCalledWith(2, '/tmp/clip.mp4');
    expect(fixture.notes).toEqual(['Opening clip.mp4 in your default video player…']);
  });

  it('reports the path when neither the configured application nor the default launches', () => {
    const fixture = fakeCapabilities({ viewer: 'VLC', launches: false });

    openFileInConfiguredViewer('/tmp/clip.mp4', fixture.capabilities, 'video player');

    expect(fixture.notes).toEqual(['No video player available. The file is at /tmp/clip.mp4']);
  });
});

describe('servesContentType', () => {
  it('accepts an extension the declaration serves a content type for', () => {
    expect(servesContentType(audioManifest, '/music/one.mp3')).toBe(true);
  });

  // The extension has an owner so the navigator row opens somewhere, but no browser decodes it, so
  // it must answer false and route out to the external player.
  it('rejects an extension the declaration claims but serves with nothing', () => {
    expect(servesContentType(audioManifest, '/music/old.wma')).toBe(false);
  });

  it('rejects an extension the declaration does not claim at all', () => {
    expect(servesContentType(markdownManifest, '/notes/one.mp3')).toBe(false);
  });

  it('matches case-insensitively, as the opener registry does', () => {
    expect(servesContentType(audioManifest, '/music/one.FLAC')).toBe(true);
    expect(servesContentType(markdownManifest, '/notes/README.MD')).toBe(true);
  });
});
