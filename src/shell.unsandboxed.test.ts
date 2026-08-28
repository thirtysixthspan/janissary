// Spawns a real child shell process and calls ChildProcess#kill() on it. Seatbelt denies the
// `signal` operation by default, so kill() throws EPERM when the test runner itself is executing
// inside a sandboxed workspace. Kept out of `npm test` / `npm run check` for that reason — run via
// `npm run test:unsandboxed` on the host.
import { describe, it, expect, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { shellStartupArgs } from './shell-startup.js';
import { executeShellCmd } from './shell.js';

// Drives the real `executeShellCmd` rather than re-implementing what it writes, so the format the
// shell actually receives is the one under test.
function runCommand(shell: ChildProcess, command: string, tabIndex: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out')), 10_000);
    executeShellCmd(shell, command, tabIndex, () => {}, (result) => {
      clearTimeout(timeout);
      resolve(result);
    });
  });
}

function spawnRealShell(): ChildProcess {
  const shellPath = process.env.SHELL || 'bash';
  const shell = spawn(shellPath, shellStartupArgs(shellPath), { stdio: ['pipe', 'pipe', 'pipe'] });
  shell.stdout!.setEncoding('utf8');
  shell.stderr!.setEncoding('utf8');
  return shell;
}

describe('persistent shell', () => {
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'janus-test-'));
  const markerFile = 'i_was_here.txt';
  writeFileSync(path.join(tmpDir, markerFile), 'hello');

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('cd persists so ls shows the new directory contents', async () => {
    const shell = spawnRealShell();

    try {
      const result1 = await runCommand(shell, `cd "${tmpDir}"`, 1);
      expect(result1).toBe('');

      const result2 = await runCommand(shell, 'ls', 2);
      expect(result2).toContain(markerFile);
    } finally {
      shell.kill();
    }
  }, 15_000);

  // The regression this file exists to catch: a command that reads its own stdin used to consume the
  // delimiter line written after it, so the command never completed and its agent stayed busy — the
  // hang seen when such a command was promoted to a terminal.
  it('completes a command that reads its own stdin', async () => {
    const shell = spawnRealShell();

    try {
      const pending = runCommand(shell, 'read -r LINE; echo "read=[$LINE]"', 3);
      shell.stdin!.write('typed by the user\n');

      expect(await pending).toBe('read=[typed by the user]');
    } finally {
      shell.kill();
    }
  }, 15_000);
});
