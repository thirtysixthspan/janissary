import { describe, it, expect, vi, afterEach } from 'vitest';
import path from 'node:path';
import { initServerLogDirectory, reapServerLogs } from './directory.js';

const { reapFilesOlderThan } = vi.hoisted(() => ({
  reapFilesOlderThan: vi.fn(),
}));

vi.mock('../state/reaper.js', () => ({ reapFilesOlderThan }));

afterEach(() => {
  vi.clearAllMocks();
});

describe('server-log directory', () => {
  it('reaps .log files older than the retention window', async () => {
    initServerLogDirectory('/test/project');
    const launchedAt = Date.UTC(2026, 6, 10, 18, 30, 5, 123);
    await reapServerLogs(launchedAt, 7);
    expect(reapFilesOlderThan).toHaveBeenCalledOnce();
    expect(reapFilesOlderThan).toHaveBeenCalledWith(
      path.join('/test/project', '.janissary', 'logs', 'server'),
      '.log',
      launchedAt - 7 * 86_400_000,
    );
  });

  it('never reaps a log modified within the last hour when retention is zero', async () => {
    initServerLogDirectory('/test/project');
    const launchedAt = Date.UTC(2026, 6, 10, 18, 30, 5, 123);
    await reapServerLogs(launchedAt, 0);
    expect(reapFilesOlderThan).toHaveBeenCalledWith(
      path.join('/test/project', '.janissary', 'logs', 'server'),
      '.log',
      launchedAt - 3_600_000,
    );
  });

  it('reaps nothing before a directory has been chosen', async () => {
    vi.resetModules();
    const fresh = await import('./directory.js');
    await expect(fresh.reapServerLogs(Date.now(), 7)).resolves.toBeUndefined();
    expect(reapFilesOlderThan).not.toHaveBeenCalled();
  });
});
