import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { REMOTE_DETACH_TIMEOUT_MS } from '../remote/serve-detach.js';
import { STATE_DIRECTORY_ENTRIES } from '../state-dirs.js';
import {
  initRemoteSessionStore,
  loadRemoteSessions,
  mergeRemoteSession,
  parseRemoteSessions,
  pruneRemoteSessions,
  saveRemoteSessions,
  withoutRemoteSession,
  type RemoteSessionRecord,
} from './store.js';

function record(overrides: Partial<RemoteSessionRecord> = {}): RemoteSessionRecord {
  return {
    session: '11111111-2222-3333-4444-555555555555',
    address: 'devbox',
    destination: 'devbox',
    host: 'devbox',
    workspaceLabel: 'claude',
    workspaceDir: '/home/me/project/.janissary/workspace/claude',
    launchLabel: 'claude',
    launchKind: 'harness',
    processes: [{ id: 'spawn-1', label: 'claude', kind: 'harness' }],
    activity: 1000,
    ...overrides,
  };
}

function project(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'janus-sessions-'));
  initRemoteSessionStore(dir);
  return dir;
}

describe('remote session store round trip', () => {
  it('reads back what it wrote', () => {
    project();
    const entry = record({ activity: Date.now() });
    saveRemoteSessions([entry]);
    expect(loadRemoteSessions()).toEqual([entry]);
  });

  it('writes the record under the project\'s own .janissary directory', () => {
    const dir = project();
    saveRemoteSessions([record({ activity: Date.now() })]);
    const file = path.join(dir, '.janissary', 'remote-sessions.json');
    expect(JSON.parse(readFileSync(file, 'utf8'))).toHaveLength(1);
  });

  // The rename is what makes a half-written file impossible; asserting no temp sibling survives is
  // how the atomic path is pinned without reaching into `atomicWriteFile` itself.
  it('leaves no temporary file behind', () => {
    const dir = project();
    saveRemoteSessions([record()]);
    const entries = readdirSync(path.join(dir, '.janissary'));
    expect(entries).toEqual(['remote-sessions.json']);
  });

  it('reads no sessions before the store has been pointed at a project', () => {
    initRemoteSessionStore('');
    expect(loadRemoteSessions()).toEqual([]);
  });

  it('reads an absent file as no sessions', () => {
    project();
    expect(loadRemoteSessions()).toEqual([]);
  });
});

describe('remote session store parsing', () => {
  it('reads a malformed file as empty rather than throwing', () => {
    expect(parseRemoteSessions('{ not json')).toEqual([]);
  });

  it('refuses a payload that is not an array', () => {
    expect(parseRemoteSessions(JSON.stringify({ session: 'a' }))).toEqual([]);
  });

  it('drops one incomplete record and keeps the rest', () => {
    const good = record();
    const text = JSON.stringify([good, { session: 'no-other-fields' }]);
    expect(parseRemoteSessions(text)).toEqual([good]);
  });

  it('refuses a record whose process entries are malformed', () => {
    const text = JSON.stringify([record({ processes: [{ id: 'spawn-1' }] as never })]);
    expect(parseRemoteSessions(text)).toEqual([]);
  });

  it('refuses a record whose launch kind is not one of the two', () => {
    const text = JSON.stringify([record({ launchKind: 'navigator' as never })]);
    expect(parseRemoteSessions(text)).toEqual([]);
  });

  it('survives a file written by a janissary that crashed mid-write', () => {
    const dir = project();
    mkdirSync(path.join(dir, '.janissary'), { recursive: true });
    writeFileSync(path.join(dir, '.janissary', 'remote-sessions.json'), '[{"session":"a"');
    expect(loadRemoteSessions()).toEqual([]);
  });
});

describe('remote session store pruning', () => {
  it('drops a record older than the far side\'s own detach timeout', () => {
    const stale = record({ activity: 0 });
    expect(pruneRemoteSessions([stale], REMOTE_DETACH_TIMEOUT_MS + 1)).toEqual([]);
  });

  it('keeps a record still inside the timeout', () => {
    const fresh = record({ activity: 10 });
    expect(pruneRemoteSessions([fresh], REMOTE_DETACH_TIMEOUT_MS)).toEqual([fresh]);
  });

  it('prunes on load, so a week-old file offers no reattach', () => {
    project();
    saveRemoteSessions([record({ activity: 0 })]);
    expect(loadRemoteSessions(REMOTE_DETACH_TIMEOUT_MS + 1)).toEqual([]);
  });
});

describe('remote session store merging', () => {
  it('replaces the record carrying the same session id', () => {
    const first = record({ activity: 1 });
    const second = record({ activity: 2 });
    expect(mergeRemoteSession([first], second)).toEqual([second]);
  });

  it('appends a record for a session it does not hold', () => {
    const first = record();
    const other = record({ session: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' });
    expect(mergeRemoteSession([first], other)).toEqual([first, other]);
  });

  it('removes only the named session', () => {
    const first = record();
    const other = record({ session: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' });
    expect(withoutRemoteSession([first, other], first.session)).toEqual([other]);
  });
});

describe('remote session store registration', () => {
  // Outliving the process is the point: a `clear` here would sweep the record on every ordinary
  // start, which is exactly the invisibility this feature exists to end.
  it('registers an init with no clear', () => {
    const entries: readonly { name: string; clear?: () => void }[] = STATE_DIRECTORY_ENTRIES;
    const entry = entries.find((candidate) => candidate.name === 'remoteSessions');
    expect(entry).toBeDefined();
    expect(entry?.clear).toBeUndefined();
  });
});
