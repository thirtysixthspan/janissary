import { afterEach, describe, expect, it, vi } from 'vitest';
import { reapFilesOlderThanDays } from './retention.js';

const { reapFilesOlderThan } = vi.hoisted(() => ({
  reapFilesOlderThan: vi.fn(),
}));

vi.mock('./reaper.js', () => ({ reapFilesOlderThan }));

const LAUNCHED_AT = Date.UTC(2026, 6, 10, 18, 30, 5, 123);

afterEach(() => {
  vi.clearAllMocks();
});

describe('reapFilesOlderThanDays', () => {
  it('reaps nothing for a directory that has not been chosen', async () => {
    await expect(reapFilesOlderThanDays('', '.txt', LAUNCHED_AT, 7)).resolves.toBeUndefined();
    expect(reapFilesOlderThan).not.toHaveBeenCalled();
  });

  it('reaps the directory and extension with a cutoff whole days before launch', async () => {
    await reapFilesOlderThanDays('/test/recordings', '.cast', LAUNCHED_AT, 7);
    expect(reapFilesOlderThan).toHaveBeenCalledOnce();
    expect(reapFilesOlderThan).toHaveBeenCalledWith('/test/recordings', '.cast', LAUNCHED_AT - 7 * 86_400_000);
  });

  it('uses launch as the cutoff when retention is zero', async () => {
    await reapFilesOlderThanDays('/test/captures', '.txt', LAUNCHED_AT, 0);
    expect(reapFilesOlderThan).toHaveBeenCalledWith('/test/captures', '.txt', LAUNCHED_AT);
  });
});
