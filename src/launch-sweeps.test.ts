import { afterEach, describe, expect, it, vi } from 'vitest';
import { startLaunchSweeps } from './launch-sweeps.js';

const sweeps = vi.hoisted(() => ({
  reapHarnessCaptures: vi.fn(() => Promise.resolve()),
  reapHarnessRecordings: vi.fn(() => Promise.resolve()),
  reapHarnessTranscripts: vi.fn(() => Promise.resolve()),
  reapShellTranscripts: vi.fn(() => Promise.resolve()),
  reapServerLogs: vi.fn(() => Promise.resolve()),
}));

vi.mock('./harness/capture/file.js', () => ({ reapHarnessCaptures: sweeps.reapHarnessCaptures }));
vi.mock('./harness/recording-file.js', () => ({ reapHarnessRecordings: sweeps.reapHarnessRecordings }));
vi.mock('./harness/transcript-file.js', () => ({ reapHarnessTranscripts: sweeps.reapHarnessTranscripts }));
vi.mock('./shell/transcript/transcript-file.js', () => ({ reapShellTranscripts: sweeps.reapShellTranscripts }));
vi.mock('./server-log/directory.js', () => ({ reapServerLogs: sweeps.reapServerLogs }));

const LAUNCHED_AT = Date.UTC(2026, 6, 10, 18, 30, 5, 123);
const allSweeps = Object.values(sweeps);

function settle(): Promise<void> {
  return new Promise((resolve) => { setImmediate(resolve); });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('startLaunchSweeps', () => {
  it('starts every sweep once with the launch time and retention days', () => {
    startLaunchSweeps(LAUNCHED_AT, 7);
    for (const sweep of allSweeps) {
      expect(sweep).toHaveBeenCalledOnce();
      expect(sweep).toHaveBeenCalledWith(LAUNCHED_AT, 7);
    }
  });

  it('returns without waiting for a sweep to finish', () => {
    for (const sweep of allSweeps) sweep.mockReturnValueOnce(new Promise<void>(() => {}));
    expect(startLaunchSweeps(LAUNCHED_AT, 7)).toBeUndefined();
    for (const sweep of allSweeps) expect(sweep).toHaveBeenCalledOnce();
  });

  it('swallows a sweep that rejects without stopping the others', async () => {
    sweeps.reapHarnessCaptures.mockReturnValueOnce(Promise.reject(new Error('sweep failed')));
    startLaunchSweeps(LAUNCHED_AT, 0);
    await settle();
    for (const sweep of allSweeps) expect(sweep).toHaveBeenCalledWith(LAUNCHED_AT, 0);
  });

  it('swallows a rejecting server log sweep without stopping the others', async () => {
    sweeps.reapServerLogs.mockReturnValueOnce(Promise.reject(new Error('sweep failed')));
    startLaunchSweeps(LAUNCHED_AT, 7);
    await settle();
    for (const sweep of allSweeps) expect(sweep).toHaveBeenCalledWith(LAUNCHED_AT, 7);
  });
});
