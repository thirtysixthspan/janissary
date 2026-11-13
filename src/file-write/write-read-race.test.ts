import type { Stats } from 'node:fs';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { contentHash } from '../editor/save-conflict.js';
import { FILE_POLICY_MAX_BYTES } from '../file-read/policy.js';
import { writeToolTextFile } from './filesystem.js';

const swap = vi.hoisted(() => ({ target: '', seen: 0, override: {} as Partial<Record<'isFile' | 'size', unknown>> }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  const statSync = vi.fn((target: fs.PathLike) => {
    const stats = actual.statSync(target);
    if (String(target) !== swap.target) return stats;
    swap.seen += 1;
    if (swap.seen < 2) return stats;
    return Object.assign(Object.create(stats) as Stats, swap.override);
  });
  return { ...actual, statSync, readFileSync: vi.fn(actual.readFileSync) };
});

let root: string;

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'janus-write-race-')));
  swap.seen = 0;
  vi.mocked(fs.readFileSync).mockClear();
});

afterEach(() => {
  swap.target = '';
  fs.rmSync(root, { recursive: true, force: true });
});

function reason(relative: string, expectedHash: string): string | undefined {
  const result = writeToolTextFile(root, relative, 'new', expectedHash);
  return result.ok ? undefined : result.reason;
}

describe('writeToolTextFile expected-hash read-time checks', () => {
  it('refuses a target that stops being a regular file after classification without opening it', () => {
    swap.target = path.join(root, 'a.txt');
    fs.writeFileSync(swap.target, 'a');
    swap.override = { isFile: () => false };
    expect(reason('a.txt', contentHash('a'))).toBe('Not a text file');
    expect(vi.mocked(fs.readFileSync)).not.toHaveBeenCalledWith(swap.target);
    swap.target = '';
    expect(fs.readFileSync(path.join(root, 'a.txt'), 'utf8')).toBe('a');
  });

  it('refuses a file that grew past 5 MiB after its size was checked', () => {
    swap.target = path.join(root, 'big.txt');
    const content = 'a'.repeat(FILE_POLICY_MAX_BYTES + 1);
    fs.writeFileSync(swap.target, content);
    swap.override = { size: 1 };
    expect(reason('big.txt', contentHash(content))).toBe('File too large (>5 MB)');
    const file = swap.target;
    swap.target = '';
    expect(fs.readFileSync(file, 'utf8')).toBe(content);
  });
});
