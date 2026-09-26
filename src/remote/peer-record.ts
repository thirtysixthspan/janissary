import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// The on-disk record a `DetachedPeer` keeps at `.janissary/remote/<session>.json` under its root:
// the pid that owns it, the Unix socket a relay connects to, and — once the peer is provisioning
// one — the label its workspace is named after. It is a contract between processes on one host, so
// its path, its writer and its one validated reader all live here.
export type PeerRecord = { pid: number; socket: string; label?: string };

export function peerRecordDir(root: string): string {
  return path.join(root, '.janissary', 'remote');
}

export function peerRecordPath(root: string, session: string): string {
  return path.join(peerRecordDir(root), `${session}.json`);
}

export function writePeerRecord(file: string, record: PeerRecord): void {
  writeFileSync(file, JSON.stringify(record), { mode: 0o600 });
}

function isPeerRecord(value: unknown): value is PeerRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return Number.isSafeInteger(record.pid) && (record.pid as number) > 0
    && typeof record.socket === 'string'
    && (record.label === undefined || typeof record.label === 'string');
}

// `'missing'` when no record file exists — a peer that has already gone — and `'invalid'` when one
// exists but cannot be read or does not hold a record, so a caller that must tell an ended session
// from a broken one can; the others treat both as "no peer".
export function readPeerRecord(file: string): PeerRecord | 'missing' | 'invalid' {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'invalid';
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return isPeerRecord(parsed) ? parsed : 'invalid';
  } catch {
    return 'invalid';
  }
}
