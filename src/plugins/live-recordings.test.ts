import { describe, it, expect } from 'vitest';
import { liveRecordingPaths } from './live-recordings.js';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';

// Whether a recording is still being written is the one question a file cannot answer about itself:
// a recording ended by closing its tab carries no exit event, so a player polling the file would see
// a session that is paused and one that has finished look identical. Only the host knows.
describe('liveRecordingPaths', () => {
  function managersWith(tabs: Tab[], live: Record<string, string>) {
    return {
      tab: { tabs },
      harness: {
        liveRecordingPathOf: (label: string) => live[label],
      },
    } as unknown as Managers;
  }

  function harnessTab(label: string): Tab {
    return { label, view: 'harness', harness: { name: 'claude', program: 'claude', ptyId: 'p1', status: 'running' } } as unknown as Tab;
  }

  // A shell tab is a plugin tab, and the shape the host used to skip. A shell recording that answered
  // "finished" would be marked done in the player while the shell was still writing to it.
  function shellTab(label: string): Tab {
    return { label, view: 'plugin', plugin: { id: 'shell', instanceKey: label, schemaVersion: 2, payload: {}, fileRefs: [] } } as unknown as Tab;
  }

  it('reports a harness or ssh tab\'s recording while its PTY is writing it', () => {
    const file = '/project/.janissary/recordings/claude-2026.cast';
    expect(liveRecordingPaths(managersWith([harnessTab('claude')], { claude: file }))).toEqual(new Set([file]));
  });

  it('reports a shell tab\'s recording too, which is the tab kind this widened', () => {
    const file = '/project/.janissary/recordings/devbox-2026.cast';
    expect(liveRecordingPaths(managersWith([shellTab('devbox')], { devbox: file }))).toEqual(new Set([file]));
  });

  it('contributes nothing for a tab that has produced no output yet', () => {
    // No file means no recording, and an empty entry would put a path in the set that nothing can play.
    expect(liveRecordingPaths(managersWith([harnessTab('claude'), shellTab('devbox')], {}))).toEqual(new Set());
  });

  it('contributes nothing for a tab whose session has ended, however it ended', () => {
    // The tab stays open after its process exits and its file stays on disk; neither makes the
    // recording live, and answering otherwise is what marks a finished file as still growing.
    expect(liveRecordingPaths(managersWith([harnessTab('claude')], {}))).toEqual(new Set());
  });

  it('gathers every open recording at once, across tab kinds', () => {
    const tabs = [harnessTab('claude'), shellTab('devbox'), { label: 'notes' } as unknown as Tab];
    const live = { claude: '/a.cast', devbox: '/b.cast' };
    expect(liveRecordingPaths(managersWith(tabs, live)))
      .toEqual(new Set(['/a.cast', '/b.cast']));
  });
});