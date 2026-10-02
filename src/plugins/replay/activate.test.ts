import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  TabPluginRejection, type TabPluginPayload, type TabPluginServerCapabilities,
} from '../api.js';
import { openerForExtension } from '../../openers/index.js';
import { activate, replayLabelFromFilename } from './activate.js';
import { replayManifest } from './manifest.js';

function fakeCapabilities(options: { live?: boolean } = {}) {
  const opened: TabPluginPayload[] = [];
  const keys: string[] = [];
  const isRecordingLive = vi.fn(() => options.live ?? false);
  const capabilities: TabPluginServerCapabilities = {
    note: () => { /* unused */ },
    openOrFocusTab: (key, factory) => {
      keys.push(key);
      opened.push(factory({ registerFile: (file) => `/open/ref-${file.length}` }));
    },
    isRecordingLive,
    rejectRequest: (reason): never => { throw new TabPluginRejection(reason); },
    reportFailure: (reason): never => { throw new Error(String(reason)); },
  } as unknown as TabPluginServerCapabilities;
  return { capabilities, isRecordingLive, keys, opened };
}

const recording = (name: string) => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'replay-')), name);
  writeFileSync(file, '{"version":3,"term":{"cols":80,"rows":24}}\n');
  return file;
};

describe('replay opener registration', () => {
  it('claims the cast extension case-insensitively through the generic adapter', () => {
    expect(openerForExtension('.cast')?.name).toBe('replay');
    expect(openerForExtension('.CAST')?.name).toBe('replay');
    expect(openerForExtension('.mp4')?.name).not.toBe('replay');
  });

  it('serves a recording as the format\'s own media type, so it arrives as text', () => {
    expect(replayManifest.fileExtensions['.cast']).toBe('application/x-asciicast');
  });

  it('claims no command of its own, only the core route the two commands name', () => {
    expect(replayManifest.coreRoutes).toEqual(['replay']);
    expect(replayManifest.command).toBeUndefined();
  });
});

describe('replay opener', () => {
  it('opens a tab named after the label the artifact was named for', () => {
    const file = recording('devbox-2026-10-01T14-32-05-123Z.cast');
    const { capabilities, keys, opened } = fakeCapabilities();
    activate().opener.inline(file, capabilities);
    expect(keys).toEqual([file]);
    expect(opened[0].title).toBe('replay: devbox');
  });

  it('keeps a whole stem for a file that is not named by the artifact scheme', () => {
    expect(replayLabelFromFilename('/tmp/session.cast')).toBe('session');
    expect(replayLabelFromFilename('/tmp/2026-10-01T14-32-05-123Z.cast')).toBe('2026-10-01T14-32-05-123Z');
  });

  it('registers the recording through the one registration path every file tab uses', () => {
    const file = recording('claude-2026-10-01T14-32-05-123Z.cast');
    const { capabilities, opened } = fakeCapabilities();
    activate().opener.inline(file, capabilities);
    expect(opened[0].payload).toMatchObject({
      path: file,
      name: 'claude-2026-10-01T14-32-05-123Z.cast',
      url: `/open/ref-${file.length}`,
    });
  });

  it('reports a recording no live tab holds as finished, and one it does as live', () => {
    const file = recording('claude-2026-10-01T14-32-05-123Z.cast');
    const finished = fakeCapabilities();
    activate().opener.inline(file, finished.capabilities);
    expect(finished.opened[0].payload).toMatchObject({ finished: true });
    expect(finished.isRecordingLive).toHaveBeenCalledWith(file);

    const live = fakeCapabilities({ live: true });
    activate().opener.inline(file, live.capabilities);
    expect(live.opened[0].payload).toMatchObject({ finished: false });
  });

  it('refuses a file that is not a recording, rather than opening a tab holding it', () => {
    const { capabilities, opened } = fakeCapabilities();
    expect(() => activate().opener.inline('/tmp/notes.txt', capabilities))
      .toThrow(new TabPluginRejection('Not a terminal recording.'));
    expect(opened).toHaveLength(0);
  });

  it('has no external presentation, because nothing outside the app can seek a recording', () => {
    const { capabilities } = fakeCapabilities();
    expect(() => activate().opener.external?.('/tmp/session.cast', capabilities))
      .toThrow(new TabPluginRejection('A terminal recording has no external viewer.'));
  });

  it('rejects an unknown intent name against a real payload, and has no intents of its own', () => {
    const file = recording('claude-2026-10-01T14-32-05-123Z.cast');
    const { capabilities, opened } = fakeCapabilities();
    activate().opener.inline(file, capabilities);
    const payload = opened[0].payload;
    // The rejection is thrown rather than answered, which is what every guarded plugin call does.
    expect(() => activate().intent({ intent: 'rewind', payload: {}, tabPayload: payload }, capabilities))
      .toThrow(new TabPluginRejection('unknown replay intent "rewind"'));
  });
});