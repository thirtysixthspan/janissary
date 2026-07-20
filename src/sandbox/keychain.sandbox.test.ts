import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { sandboxAvailable, sandboxSpawn } from './index.js';

// Exercises the real `sandbox-exec` profile against the macOS Keychain database files a
// harness writes when it persists a refreshed OAuth token. The token store lives under the
// real `~/Library/Keychains`, which these tests must never touch — so instead of running with
// the host's own `$HOME`, they take the shipped profile + `-D` params from `sandboxSpawn` and
// relocate every occurrence of the real home path to a throwaway temp dir, then point the
// sandboxed process's `HOME` at it. The profile's Keychain rules are all home-relative, so this
// faithfully exercises them without going near the real login/data-protection keychains.
describe.skipIf(!sandboxAvailable())('sandbox Keychain write carve-outs', () => {
  let workspaceDir: string;
  let fakeHome: string;
  let keychainsDir: string;
  let baseArgs: string[];
  let env: NodeJS.ProcessEnv;

  beforeEach(() => {
    loadConfig(mkdtempSync(path.join(tmpdir(), 'kc-cfg-')));
    workspaceDir = mkdtempSync(path.join(tmpdir(), 'kc-ws-'));
    mkdirSync(`${workspaceDir}.tmp`, { recursive: true });
    fakeHome = realpathSync(mkdtempSync(path.join(tmpdir(), 'kc-home-')));
    keychainsDir = path.join(fakeHome, 'Library', 'Keychains');
    mkdirSync(keychainsDir, { recursive: true });

    const realHome = realpathSync(homedir());
    const spawn = sandboxSpawn({ workspaceDir }, '/bin/sh', []);
    baseArgs = spawn.args.slice(0, spawn.args.indexOf('--')).map((a) => a.split(realHome).join(fakeHome));
    env = { ...spawn.env, HOME: fakeHome } as NodeJS.ProcessEnv;
  });

  afterEach(() => {
    rmSync(workspaceDir, { recursive: true, force: true });
    rmSync(`${workspaceDir}.tmp`, { recursive: true, force: true });
    rmSync(fakeHome, { recursive: true, force: true });
  });

  // Whether the sandboxed process can write to `target` (an absolute path under the fake home).
  const canWrite = (target: string): boolean => {
    try {
      execFileSync('sandbox-exec', [...baseArgs, '--', '/bin/sh', '-c', `printf x >> "${target}"`],
        { cwd: workspaceDir, env, stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  };

  it('allows persisting a refreshed credential to the data-protection keychain (keychain-2.db)', () => {
    // Regression: without the data-protection carve-out this write is denied, the stale expired
    // token keeps being sent, and the provider returns 401 "Please run /login".
    const uuidDir = path.join(keychainsDir, '11111111-2222-3333-4444-555555555555');
    mkdirSync(uuidDir, { recursive: true });
    writeFileSync(path.join(uuidDir, 'keychain-2.db'), 'x');
    expect(canWrite(path.join(uuidDir, 'keychain-2.db'))).toBe(true);
    // Atomic-write temp sibling and SQLite sidecar the persistence path also touches.
    expect(canWrite(path.join(uuidDir, 'keychain-2.db.sb-abc123'))).toBe(true);
    expect(canWrite(path.join(uuidDir, 'keychain-2.db-wal'))).toBe(true);
  });

  it('still allows the login keychain write (login.keychain-db)', () => {
    writeFileSync(path.join(keychainsDir, 'login.keychain-db'), 'x');
    expect(canWrite(path.join(keychainsDir, 'login.keychain-db'))).toBe(true);
    expect(canWrite(path.join(keychainsDir, 'login.keychain-db.sb-abc123'))).toBe(true);
  });

  it('keeps the carve-out narrow: non-keychain files under ~/Library/Keychains stay denied', () => {
    const uuidDir = path.join(keychainsDir, '11111111-2222-3333-4444-555555555555');
    mkdirSync(uuidDir, { recursive: true });
    expect(canWrite(path.join(uuidDir, 'metadata.plist'))).toBe(false);
    expect(canWrite(path.join(keychainsDir, 'other.db'))).toBe(false);
  });
});
