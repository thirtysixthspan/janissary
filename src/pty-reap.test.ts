import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PTY_REAP_GRACE_MS, reapProcessGroup } from './pty-reap.js';
import { spawnPty } from './pty.js';

describe('reapProcessGroup', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('sends SIGTERM to the whole group, then SIGKILL once the grace has passed', () => {
    const send = vi.fn();
    reapProcessGroup(4321, send);
    expect(send).toHaveBeenCalledExactlyOnceWith(-4321, 'SIGTERM');
    vi.advanceTimersByTime(PTY_REAP_GRACE_MS - 1);
    expect(send).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1);
    expect(send).toHaveBeenLastCalledWith(-4321, 'SIGKILL');
  });

  // An empty group answers ESRCH; a second signal would only widen the window in which its id could
  // belong to some unrelated group.
  it('sends nothing further when the group was already empty', () => {
    const send = vi.fn(() => { throw Object.assign(new Error('no such process'), { code: 'ESRCH' }); });
    reapProcessGroup(4321, send);
    vi.advanceTimersByTime(PTY_REAP_GRACE_MS);
    expect(send).toHaveBeenCalledOnce();
  });

  it('swallows a SIGKILL that finds the group gone', () => {
    const send = vi.fn()
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(() => { throw new Error('no such process'); });
    reapProcessGroup(4321, send);
    expect(() => vi.advanceTimersByTime(PTY_REAP_GRACE_MS)).not.toThrow();
    expect(send).toHaveBeenCalledTimes(2);
  });

  // `kill(0)` is janus's own group and `kill(-1)` is every process the user owns.
  it.each([undefined, 0, 1, -5, 12.5, NaN, process.pid])('never signals for the id %s', (pgid) => {
    const send = vi.fn();
    reapProcessGroup(pgid, send);
    vi.advanceTimersByTime(PTY_REAP_GRACE_MS);
    expect(send).not.toHaveBeenCalled();
  });
});

// A real PTY whose program ignores SIGHUP, which is all `node-pty`'s own kill sends. Before the
// group was reaped it ran on until its own sleep ended; now the kill ends it. The program is exec'd
// so it is the PTY's direct child, and it reports ready only once its trap is set, so a kill that
// lands during shell startup cannot pass this test by accident.
describe('spawnPty process-group reaping', () => {
  it('ends a program that ignores SIGHUP when the PTY is killed', async () => {
    let output = '';
    let exited = false;
    const session = spawnPty('sleep', `trap '' HUP; echo reap-ready; exec sleep 30`, process.cwd(), {
      onData: (_id, data) => { output += data; },
      onExit: () => { exited = true; },
    });
    try {
      await vi.waitFor(() => { expect(output).toContain('reap-ready'); }, { timeout: 10_000, interval: 50 });
      session.kill();
      await vi.waitFor(() => { expect(exited).toBe(true); }, { timeout: 5000, interval: 50 });
    } finally {
      session.kill();
    }
  }, 20_000);
});
