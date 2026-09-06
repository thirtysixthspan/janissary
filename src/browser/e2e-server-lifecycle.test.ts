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

  // A child killed outright says nothing on its way out, so its own exit status is the only account
  // of the death there is. Without it every one of these reads as the same bare "exited".
  it('names the signal that killed the child', () => {
    const { onGone } = start();
    child.handlers.get('exit')?.(null, 'SIGKILL');
    expect(onGone).toHaveBeenCalledWith('e2e browser exited (signal SIGKILL)');
  });

  it('names a non-zero exit code', () => {
    const { onGone } = start();
    child.handlers.get('exit')?.(1, null);
    expect(onGone).toHaveBeenCalledWith('e2e browser exited (code 1)');
  });

  it('names a clean exit as one, rather than leaving it indistinguishable from a death', () => {
    const { onGone } = start();
    child.handlers.get('exit')?.(0, null);
    expect(onGone).toHaveBeenCalledWith('e2e browser exited (code 0)');
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

// A discarded stdio made every one of these failures the same bare "exited". The reason a browser
// died is the browser's to give, and it only ever gives it on its own streams.
describe('startE2EBrowserServer reporting what the child said', () => {
  it('carries the child\'s output into the exit message', () => {
    const { onGone } = start();
    child.say('browserType.launchServer: Executable doesn\'t exist at /pw/Chrome.app\n');
    child.handlers.get('exit')?.();
    expect(onGone).toHaveBeenCalledWith(
      'e2e browser exited\nbrowserType.launchServer: Executable doesn\'t exist at /pw/Chrome.app',
    );
  });

  it('leaves the message alone when the child said nothing', () => {
    const { onGone } = start();
    child.handlers.get('exit')?.();
    expect(onGone).toHaveBeenCalledWith('e2e browser exited');
  });

  it('carries both the child\'s status and the browser\'s own words', () => {
    const { onGone } = start();
    child.say('chromium exited (signal SIGKILL)\n');
    child.handlers.get('exit')?.(1, null);
    expect(onGone).toHaveBeenCalledWith(
      'e2e browser exited (code 1)\nchromium exited (signal SIGKILL)',
    );
  });

  it('carries it into a failed start too', () => {
    const { onGone } = start();
    child.say('sandbox-exec: profile could not be compiled\n');
    child.handlers.get('error')?.(new Error('ENOENT'));
    expect(onGone).toHaveBeenCalledWith(
      'e2e browser failed to start: ENOENT\nsandbox-exec: profile could not be compiled',
    );
  });

  // The guard dying is not the child's fault, but whatever the child managed to say is still the
  // best evidence available about the state everything was in.
  it('carries it when the guard is what failed', () => {
    const { onGone } = start();
    child.say('chromium: crashed on startup\n');
    const guardOptions = mocks.startE2EGuard.mock.calls[0][0] as { onError: (message: string) => void };
    guardOptions.onError('e2e browser guard failed to listen: EADDRINUSE');
    expect(onGone).toHaveBeenCalledWith(
      'e2e browser guard failed to listen: EADDRINUSE\nchromium: crashed on startup',
    );
  });

  // Read before the release kills the child, or the message would describe a browser it had already
  // taken the evidence away from.
  it('reads the child\'s output before killing it', () => {
    const { onGone } = start();
    child.say('last words\n');
    child.handlers.get('exit')?.();
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(onGone).toHaveBeenCalledWith(expect.stringContaining('last words'));
  });

  it('says nothing extra for a browser the user closed', () => {
    const { onGone, handle } = start();
    child.say('shutting down\n');
    handle.close();
    expect(onGone).not.toHaveBeenCalled();
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
