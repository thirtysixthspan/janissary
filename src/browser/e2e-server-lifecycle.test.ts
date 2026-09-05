import { beforeEach, describe, expect, it } from 'vitest';
import {
  child, e2eServerMocks, guardClose, resetE2EServerFixture, start,
} from './e2e-server-test-fixture.js';

const mocks = e2eServerMocks();
beforeEach(resetE2EServerFixture);

describe('startE2EBrowserServer close', () => {
  it('stops the guard, kills the child, and removes its own scratch allocation', () => {
    const { handle } = start();
    handle.close();
    expect(guardClose).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(mocks.scratchRemove).toHaveBeenCalledTimes(1);
  });

  it('is idempotent', () => {
    const { handle } = start();
    handle.close();
    handle.close();
    handle.close();
    expect(guardClose).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(mocks.scratchRemove).toHaveBeenCalledTimes(1);
  });

  it('suppresses a later onGone', () => {
    const { handle, onGone } = start();
    handle.close();
    child.handlers.get('exit')?.();
    expect(onGone).not.toHaveBeenCalled();
  });
});

describe('startE2EBrowserServer failure reporting', () => {
  it('fires onGone exactly once for a child that exits unexpectedly', () => {
    const { onGone } = start();
    child.handlers.get('exit')?.();
    child.handlers.get('exit')?.();
    expect(onGone).toHaveBeenCalledTimes(1);
    expect(onGone).toHaveBeenCalledWith(expect.stringContaining('exited'));
  });

  it('fires onGone for a child that never starts', () => {
    const { onGone } = start();
    child.handlers.get('error')?.(new Error('ENOENT'));
    expect(onGone).toHaveBeenCalledWith(expect.stringContaining('ENOENT'));
  });

  it('fires onGone when the guard cannot listen', () => {
    const { onGone } = start();
    const guardOptions = mocks.startE2EGuard.mock.calls[0][0] as { onError: (message: string) => void };
    guardOptions.onError('e2e browser guard failed to listen: EADDRINUSE');
    expect(onGone).toHaveBeenCalledWith(expect.stringContaining('EADDRINUSE'));
  });

  it('fires onGone when the spawn itself throws', () => {
    mocks.spawn.mockImplementation(() => { throw new Error('spawn refused'); });
    const { onGone, handle } = start();
    expect(onGone).toHaveBeenCalledWith(expect.stringContaining('spawn refused'));
    expect(() => handle.close()).not.toThrow();
  });
});

describe('startE2EBrowserServer failure cleanup', () => {
  function released() {
    return {
      guard: guardClose.mock.calls.length,
      child: child.kill.mock.calls.length,
      scratch: mocks.scratchRemove.mock.calls.length,
    };
  }

  it('releases everything when the guard cannot listen', () => {
    start();
    const guardOptions = mocks.startE2EGuard.mock.calls[0][0] as {
      port: number; upstreamPort: number; onError: (message: string) => void;
    };
    guardOptions.onError('e2e browser guard failed to listen: EADDRINUSE');
    expect(released()).toEqual({ guard: 1, child: 1, scratch: 1 });
    expect(mocks.releasedPorts).toEqual([guardOptions.port, guardOptions.upstreamPort]);
  });

  it('releases everything when the child exits unexpectedly', () => {
    start();
    child.handlers.get('exit')?.();
    expect(released()).toEqual({ guard: 1, child: 1, scratch: 1 });
  });

  it('releases everything when the child never starts', () => {
    start();
    child.handlers.get('error')?.(new Error('ENOENT'));
    expect(released()).toEqual({ guard: 1, child: 1, scratch: 1 });
  });

  it('rolls back what it already acquired when the spawn throws', () => {
    mocks.spawn.mockImplementation(() => { throw new Error('spawn refused'); });
    start();
    expect(guardClose).toHaveBeenCalledTimes(1);
    expect(mocks.scratchRemove).toHaveBeenCalledTimes(1);
  });

  it('reports a scratch allocation that fails instead of throwing at its caller', () => {
    mocks.allocateBrowserScratch.mockImplementation(() => { throw new Error('EACCES'); });
    const { onGone, handle } = start();
    expect(onGone).toHaveBeenCalledWith(expect.stringContaining('EACCES'));
    expect(mocks.startE2EGuard).not.toHaveBeenCalled();
    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(() => handle.close()).not.toThrow();
  });

  it('releases once across a failure followed by a close', () => {
    const { onGone, handle } = start();
    child.handlers.get('exit')?.();
    handle.close();
    expect(released()).toEqual({ guard: 1, child: 1, scratch: 1 });
    expect(onGone).toHaveBeenCalledTimes(1);
  });

  it('releases once across a close followed by the child\'s exit', () => {
    const { onGone, handle } = start();
    handle.close();
    child.handlers.get('exit')?.();
    expect(released()).toEqual({ guard: 1, child: 1, scratch: 1 });
    expect(onGone).not.toHaveBeenCalled();
  });
});
