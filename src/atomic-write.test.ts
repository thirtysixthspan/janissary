import { afterEach, describe, expect, it, vi } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type * as Fs from 'node:fs';
import { atomicWriteFile } from './atomic-write.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof Fs>();
  return { ...actual, renameSync: vi.fn(actual.renameSync) };
});

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

  it('preserves an existing file and removes the temporary file when the final rename fails', () => {
    const directory = root();
    const target = path.join(directory, 'target');
    writeFileSync(target, 'before');
    vi.mocked(renameSync).mockImplementationOnce(() => {
      throw Object.assign(new Error('forced replacement failure'), { code: 'EIO' });
    });

    expect(() => atomicWriteFile(target, 'after')).toThrow('forced replacement failure');

    expect(renameSync).toHaveBeenCalledOnce();
    expect(readFileSync(target, 'utf8')).toBe('before');
    expect(readdirSync(directory)).toEqual(['target']);
  });
});
