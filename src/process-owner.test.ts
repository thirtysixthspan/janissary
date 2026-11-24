import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as childProcess from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { pidBelongsToCurrentUser } from './process-owner.js';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof childProcess>();
  return { ...actual, execFileSync: vi.fn() };
});

const execFile = vi.mocked(execFileSync);
const uid = typeof process.getuid === 'function' ? process.getuid() : undefined;
const foreignUid = uid === 0 ? 1 : 0;

beforeEach(() => { execFile.mockReset(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('pidBelongsToCurrentUser', () => {
  it.skipIf(uid === undefined)('recognizes a live process owned by this account', () => {
    execFile.mockImplementation(() => ` ${uid}\n`);
    expect(pidBelongsToCurrentUser(4242)).toBe(true);
    expect(execFile).toHaveBeenCalledWith('ps', ['-p', '4242', '-o', 'uid='], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  });

  it.skipIf(uid === undefined)('rejects a pid owned by another account', () => {
    execFile.mockImplementation(() => ` ${foreignUid}\n`);
    expect(pidBelongsToCurrentUser(4242)).toBe(false);
  });

  it('rejects a pid the process table does not list', () => {
    execFile.mockImplementation(() => { throw Object.assign(new Error('exit 1'), { code: 1 }); });
    expect(pidBelongsToCurrentUser(4242)).toBe(false);
  });

  it('rejects empty process-table output', () => {
    execFile.mockImplementation(() => '   \n');
    expect(pidBelongsToCurrentUser(4242)).toBe(false);
  });
});
