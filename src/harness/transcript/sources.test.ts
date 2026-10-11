import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createTranscriptSource } from './sources.js';
import { RemoteTranscriptFollow } from '../../remote/serve-transcript.js';
import type { ServerFrame } from '../../remote/protocol-frames.js';

let root: string;
let cwd: string;
let dataHome: string;
const spawnedAt = Date.now();

beforeEach(() => {
  mkdirSync('temp', { recursive: true });
  root = realpathSync(mkdtempSync(path.join(process.cwd(), 'temp', 'opencode-source-')));
  cwd = path.join(root, 'workspace');
  dataHome = path.join(`${cwd}.tmp`, 'opencode-data');
  mkdirSync(path.join(dataHome, 'opencode'), { recursive: true });
  writeFileSync(path.join(dataHome, 'opencode', 'auth.json'), '{}');
  vi.stubEnv('HOME', root);
  vi.stubEnv('XDG_DATA_HOME', '');
  vi.useFakeTimers();
  vi.setSystemTime(spawnedAt);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

function writeSession(directory: string): void {
  mkdirSync(path.join(directory, 'opencode'), { recursive: true });
  const database = new DatabaseSync(path.join(directory, 'opencode', 'opencode.db'));
  database.exec('CREATE TABLE session (id TEXT, directory TEXT, time_created INTEGER, parent_id TEXT)');
  database.exec('CREATE TABLE message (id TEXT, session_id TEXT, role TEXT, time_created INTEGER)');
  database.exec('CREATE TABLE part (id TEXT, message_id TEXT, type TEXT, text TEXT, tool TEXT, state TEXT)');
  database.prepare('INSERT INTO session VALUES (?, ?, ?, ?)').run('s1', cwd, spawnedAt + 1, null);
  database.prepare('INSERT INTO message VALUES (?, ?, ?, ?)').run('m1', 's1', 'user', spawnedAt + 2);
  database.prepare('INSERT INTO part VALUES (?, ?, ?, ?, ?, ?)').run('p1', 'm1', 'text', 'private session', null, null);
  database.close();
}

describe('OpenCode transcript data location', () => {
  it('reads a local workspace transcript from the OAuth data directory', () => {
    writeSession(dataHome);
    const source = createTranscriptSource('opencode', cwd, spawnedAt, cwd);
    expect(source?.poll()).toEqual(['user: private session']);
    expect(source?.resolved()).toBe(true);
  });

  it('relays a remote workspace transcript from the OAuth data directory', () => {
    writeSession(dataHome);
    const frames: ServerFrame[] = [];
    const follow = new RemoteTranscriptFollow((frame) => { frames.push(frame); });
    try {
      follow.follow('opencode', cwd);
      vi.advanceTimersByTime(2000);
      expect(frames).toEqual([{ type: 'transcript', blocks: ['user: private session'] }]);
    } finally {
      follow.dispose();
    }
  });

  it('respects the ambient data home for a launch outside a workspace', () => {
    const ambient = path.join(root, 'ambient');
    vi.stubEnv('XDG_DATA_HOME', ambient);
    writeSession(ambient);
    expect(createTranscriptSource('opencode', cwd, spawnedAt)?.poll()).toEqual(['user: private session']);
  });
});
