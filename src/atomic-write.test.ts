import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { atomicWriteFile } from './atomic-write.js';

const roots: string[] = [];

function root(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'janus-atomic-write-'));
  roots.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of roots) rmSync(directory, { recursive: true, force: true });
  roots.length = 0;
});

describe('atomicWriteFile', () => {
  it('writes binary data without decoding it', () => {
    const directory = root();
    const target = path.join(directory, 'data.bin');
    const bytes = Uint8Array.from([0, 255, 128, 10]);
    atomicWriteFile(target, bytes);
    expect(readFileSync(target)).toEqual(Buffer.from(bytes));
  });

  it('preserves an existing file mode', () => {
    const directory = root();
    const target = path.join(directory, 'private.json');
    writeFileSync(target, 'before');
    chmodSync(target, 0o600);

    atomicWriteFile(target, 'after');

    expect(statSync(target).mode & 0o777).toBe(0o600);
  });

  it('leaves an existing directory in place and cleans the temporary file when replacement fails', () => {
    const directory = root();
    const target = path.join(directory, 'target');
    mkdirSync(target);
    expect(() => atomicWriteFile(target, 'content')).toThrow();
    expect(existsSync(target)).toBe(true);
    expect(readdirSync(directory)).toEqual(['target']);
  });
});
