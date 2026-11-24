import { describe, it, expect, vi, afterEach } from 'vitest';
import path from 'node:path';
import { ActivityLogger, reapActivityLogs } from './logger.js';
import { messageBus } from '../bus.js';

const { reapFilesOlderThan } = vi.hoisted(() => ({
  reapFilesOlderThan: vi.fn(),
}));

vi.mock('../state/reaper.js', () => ({ reapFilesOlderThan }));

const activityDir = path.join('/test/project', '.janissary', 'logs', 'activity');

let loggers: ActivityLogger[] = [];

afterEach(() => {
  for (const logger of loggers) logger.unsubscribe();
  loggers = [];
  messageBus.clear();
  vi.clearAllMocks();
});

function setDirectory(): void {
  loggers.push(new ActivityLogger('/test/project'));
}

describe('reapActivityLogs', () => {
  it('reaps .json files older than the retention window', async () => {
    setDirectory();
    const launchedAt = Date.UTC(2026, 6, 10, 18, 30, 5, 123);
    await reapActivityLogs(launchedAt, 7);
    expect(reapFilesOlderThan).toHaveBeenCalledOnce();
    expect(reapFilesOlderThan).toHaveBeenCalledWith(
      activityDir,
      '.json',
      launchedAt - 7 * 86_400_000,
    );
  });

  it('uses launch as the cutoff when retention is zero', async () => {
    setDirectory();
    const launchedAt = Date.UTC(2026, 6, 10, 18, 30, 5, 123);
    await reapActivityLogs(launchedAt, 0);
    expect(reapFilesOlderThan).toHaveBeenCalledWith(activityDir, '.json', launchedAt);
  });

  it('reaps nothing before a directory has been chosen', async () => {
    vi.resetModules();
    const fresh = await import('./logger.js');
    await expect(fresh.reapActivityLogs(Date.now(), 7)).resolves.toBeUndefined();
    expect(reapFilesOlderThan).not.toHaveBeenCalled();
  });
});
