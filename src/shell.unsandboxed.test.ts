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

function runCommand(
  shell: ChildProcess,
  command: string,
  delimiter: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out')), 10_000);
    let buffer = '';

    const onData = (chunk: string) => {
      buffer += chunk;
      const endIndex = buffer.indexOf(delimiter);
      if (endIndex !== -1) {
        clearTimeout(timeout);
        shell.stdout!.removeListener('data', onData);
        shell.stderr!.removeListener('data', onData);
        resolve(buffer.slice(0, Math.max(0, endIndex)).trim());
      }
    };

    shell.stdout!.on('data', onData);
    shell.stderr!.on('data', onData);

    shell.stdin!.write(`${command} 2>&1\necho "${delimiter}"\n`);
  });
}

describe('persistent shell', () => {
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'janus-test-'));
  const markerFile = 'i_was_here.txt';
  writeFileSync(path.join(tmpDir, markerFile), 'hello');

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('cd persists so ls shows the new directory contents', async () => {
    const shell = spawn(process.env.SHELL || 'bash', ['--norc', '--noprofile'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    shell.stdout!.setEncoding('utf8');
    shell.stderr!.setEncoding('utf8');

    try {
      const result1 = await runCommand(shell, `cd "${tmpDir}"`, '__TEST_CD_DONE__');
      expect(result1).toBe('');

      const result2 = await runCommand(shell, 'ls', '__TEST_LS_DONE__');
      expect(result2).toContain(markerFile);
    } finally {
      shell.kill();
    }
  }, 15_000);
});
