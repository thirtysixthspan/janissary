import { describe, it, expect, afterAll } from 'vitest';
import { spawn } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

function runCommand(
  shell: import('child_process').ChildProcess,
  cmd: string,
  delimiter: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out')), 10000);
    let buffer = '';

    const onData = (chunk: string) => {
      buffer += chunk;
      const endIdx = buffer.indexOf(delimiter);
      if (endIdx >= 0) {
        clearTimeout(timeout);
        shell.stdout!.removeListener('data', onData);
        shell.stderr!.removeListener('data', onData);
        resolve(buffer.substring(0, endIdx).trim());
      }
    };

    shell.stdout!.on('data', onData);
    shell.stderr!.on('data', onData);

    shell.stdin!.write(`${cmd} 2>&1\necho "${delimiter}"\n`);
  });
}

describe('persistent shell', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'janus-test-'));
  const markerFile = 'i_was_here.txt';
  writeFileSync(join(tmpDir, markerFile), 'hello');

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
  }, 15000);
});
