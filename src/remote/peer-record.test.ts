import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { peerRecordDir, peerRecordPath, readPeerRecord, writePeerRecord } from './peer-record.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'peer-record-'));
  mkdirSync(peerRecordDir(root), { recursive: true });
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

function seed(content: string): string {
  const file = peerRecordPath(root, 'session-1');
  writeFileSync(file, content);
  return file;
}

describe('peer record', () => {
  it('lives at .janissary/remote/<session>.json under the root', () => {
    expect(peerRecordPath('/srv/proj', 'abc')).toBe(path.join('/srv/proj', '.janissary', 'remote', 'abc.json'));
  });

  it('round-trips what the writer wrote, owner-readable only', () => {
    const file = peerRecordPath(root, 'session-1');
    writePeerRecord(file, { pid: 42, socket: '/tmp/peer.sock', label: 'claude' });
    expect(readPeerRecord(file)).toEqual({ pid: 42, socket: '/tmp/peer.sock', label: 'claude' });
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it('tells a missing record from an unreadable one', () => {
    expect(readPeerRecord(peerRecordPath(root, 'absent'))).toBe('missing');
    expect(readPeerRecord(seed('not json'))).toBe('invalid');
  });

  it.each([
    ['null', 'null'],
    ['a non-object', '"text"'],
    ['a fractional pid', JSON.stringify({ pid: 1.5, socket: '/s' })],
    ['a non-positive pid', JSON.stringify({ pid: 0, socket: '/s' })],
    ['a non-string socket', JSON.stringify({ pid: 42, socket: 7 })],
    ['a non-string label', JSON.stringify({ pid: 42, socket: '/s', label: 3 })],
  ])('refuses %s as invalid', (_name, content) => {
    expect(readPeerRecord(seed(content))).toBe('invalid');
  });
});
