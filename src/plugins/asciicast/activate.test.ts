import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  TabPluginRejection, type TabPluginPayload, type TabPluginResources, type TabPluginServerCapabilities,
} from '../api.js';
import { openerForExtension } from '../../openers/index.js';
import type { Managers } from '../../managers.js';
import { fakeNotificationsHost } from '../../notifications/tab-test-fixture.js';
import { NotificationQueue } from '../../notifications/queue.js';
import { createPluginContext } from '../context.js';
import { activate, asciicastLabelFromFilename } from './activate.js';
import { asciicastManifest } from './manifest.js';

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

// The context the host builds rather than the one a test would like to have: taken from the plugin's
// own manifest and passed through `restrictToDeclared`, so a capability the manifest never asked for
// throws instead of answering. The stub tab list is what decides a recording's liveness, exactly as it
// is in the running app — a tab with a `harness` on it is writing a file, and the host is the only
// thing that knows so.
function hostCapabilities(file: string, options: { live?: boolean } = {}) {
  const opened: TabPluginPayload[] = [];
  const keys: string[] = [];
  const tabs = [{
    label: 'janus', dotColor: '#fff', log: [], harness: options.live ? {} : undefined,
  }];
  const managers = {
    tab: {
      tabs,
      append: vi.fn(),
      closeTab: vi.fn(),
      cur: () => tabs[0],
      launchDir: '/repo',
      openPluginTab: (
        _pluginId: string, _prefix: string, key: string,
        _schemaVersion: number, _sourceLabel: string,
        factory: (resources: TabPluginResources) => TabPluginPayload,
      ) => {
        keys.push(key);
        opened.push(factory({ registerFile: (abs) => `/open/ref-${abs.length}` }));
      },
      ...fakeNotificationsHost(tabs),
    },
    harness: { recordingPathOf: (label: string) => (options.live && label === 'janus' ? file : undefined) },
    openFile: { runAs: vi.fn(async () => {}) },
    notifications: new NotificationQueue(),
  } as unknown as Managers;
  const capabilities = createPluginContext(
    managers, asciicastManifest, activate(), { label: 'janus', command: 'fixture' }, () => true,
  );
  return { capabilities, keys, opened };
}

const recording = (name: string) => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'asciicast-')), name);
  writeFileSync(file, '{"version":3,"term":{"cols":80,"rows":24}}\n');
  return file;
};

describe('asciicast opener registration', () => {
  it('claims the cast extension case-insensitively through the generic adapter', () => {
    expect(openerForExtension('.cast')?.name).toBe('asciicast');
    expect(openerForExtension('.CAST')?.name).toBe('asciicast');
    expect(openerForExtension('.mp4')?.name).not.toBe('asciicast');
  });

  it('serves a recording as the format\'s own media type, so it arrives as text', () => {
    expect(asciicastManifest.fileExtensions['.cast']).toBe('application/x-asciicast');
  });

  // `play` is a core command, so the plugin cannot claim it as one of its own; declaring the recorded
  // types playable is what lets it be dispatched to, and it keeps no command word and no route token.
  it('declares its recorded types playable, with no command and no core route of its own', () => {
    expect(asciicastManifest.playable).toBe(true);
    expect(asciicastManifest.command).toBeUndefined();
    expect('coreRoutes' in asciicastManifest).toBe(false);
  });
});

describe('asciicast opener', () => {
  it('opens a tab named after the label the artifact was named for', () => {
    const file = recording('devbox-2026-10-01T14-32-05-123Z.cast');
    const { capabilities, keys, opened } = fakeCapabilities();
    activate().opener.inline(file, capabilities);
    expect(keys).toEqual([file]);
    expect(opened[0].title).toBe('asciicast: devbox');
  });

  it('keeps a whole stem for a file that is not named by the artifact scheme', () => {
    expect(asciicastLabelFromFilename('/tmp/session.cast')).toBe('session');
    expect(asciicastLabelFromFilename('/tmp/2026-10-01T14-32-05-123Z.cast')).toBe('2026-10-01T14-32-05-123Z');
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

  it('reads liveness through the host, whose grant is the manifest\'s own declaration', () => {
    const file = recording('claude-2026-10-01T14-32-05-123Z.cast');
    const finished = hostCapabilities(file);
    activate().opener.inline(file, finished.capabilities);
    expect(finished.opened[0].payload).toMatchObject({ finished: true });

    const live = hostCapabilities(file, { live: true });
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
      .toThrow(new TabPluginRejection('unknown asciicast intent "rewind"'));
  });
});