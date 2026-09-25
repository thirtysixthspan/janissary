import { beforeEach, describe, expect, it } from 'vitest';
import {
  child, e2eServerMocks, guardCall, guardClose, internalPort, resetE2EServerFixture, start,
} from './e2e-server-test-fixture.js';

const mocks = e2eServerMocks();
beforeEach(resetE2EServerFixture);

describe('startE2EBrowserServer close', () => {
  it('stops the guard, kills the child, and removes its own scratch allocation', async () => {
    const { handle } = await start();
    handle.close();
    expect(guardClose).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(mocks.scratchRemove).toHaveBeenCalledTimes(1);
  });

  it('is idempotent', async () => {
    const { handle } = await start();
    handle.close();
    handle.close();
    handle.close();
    expect(guardClose).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(mocks.scratchRemove).toHaveBeenCalledTimes(1);
  });

  it('suppresses a later onGone', async () => {
    const { handle, onGone } = await start();
    handle.close();
    child.handlers.get('exit')?.();
    expect(onGone).not.toHaveBeenCalled();
  });
});

describe('startE2EBrowserServer failure reporting', () => {
  it('fires onGone exactly once for a child that exits unexpectedly', async () => {
    const { onGone } = await start();
    child.handlers.get('exit')?.();
    child.handlers.get('exit')?.();
    expect(onGone).toHaveBeenCalledTimes(1);
    expect(onGone).toHaveBeenCalledWith(expect.stringContaining('exited'), undefined);
  });

  // A child killed outright says nothing on its way out, so its own exit status is the only account
  // of the death there is. Without it every one of these reads as the same bare "exited".
  it('names the signal that killed the child', async () => {
    const { onGone } = await start();
    child.handlers.get('exit')?.(null, 'SIGKILL');
    expect(onGone).toHaveBeenCalledWith('e2e browser exited (signal SIGKILL)', undefined);
  });

  it('names a non-zero exit code', async () => {
    const { onGone } = await start();
    child.handlers.get('exit')?.(1, null);
    expect(onGone).toHaveBeenCalledWith('e2e browser exited (code 1)', undefined);
  });

  it('names a clean exit as one, rather than leaving it indistinguishable from a death', async () => {
    const { onGone } = await start();
    child.handlers.get('exit')?.(0, null);
    expect(onGone).toHaveBeenCalledWith('e2e browser exited (code 0)', undefined);
  });

  it('fires onGone for a child that never starts', async () => {
    const { onGone } = await start();
    child.handlers.get('error')?.(new Error('ENOENT'));
    expect(onGone).toHaveBeenCalledWith(expect.stringContaining('ENOENT'), undefined);
  });

  it('fires onGone when the guard cannot listen', async () => {
    const { onGone } = await start();
    const guardOptions = mocks.startE2EGuard.mock.calls[0][0] as { onError: (message: string) => void };
    guardOptions.onError('e2e browser guard failed to listen: EADDRINUSE');
    expect(onGone).toHaveBeenCalledWith(expect.stringContaining('EADDRINUSE'), undefined);
  });

  it('fires onGone when the spawn itself throws', async () => {
    mocks.spawn.mockImplementation(() => { throw new Error('spawn refused'); });
    const { onGone, handle } = await start();
    expect(onGone).toHaveBeenCalledWith(expect.stringContaining('spawn refused'), undefined);
    expect(() => handle.close()).not.toThrow();
  });
});

// A discarded stdio made every one of these failures the same bare "exited". The reason a browser
// died is the browser's to give, and it only ever gives it on its own streams.
describe('startE2EBrowserServer reporting what the child said', () => {
  it('carries the child\'s output into the exit message', async () => {
    const { onGone } = await start();
    child.say('browserType.launchServer: Executable doesn\'t exist at /pw/Chrome.app\n');
    child.handlers.get('exit')?.();
    expect(onGone).toHaveBeenCalledWith(
      'e2e browser exited\nbrowserType.launchServer: Executable doesn\'t exist at /pw/Chrome.app',
      expect.any(String),
    );
  });

  it('leaves the message alone when the child said nothing', async () => {
    const { onGone } = await start();
    child.handlers.get('exit')?.();
    expect(onGone).toHaveBeenCalledWith('e2e browser exited', undefined);
  });

  // The child's own end report restates the death the message already announces, one process down.
  // It stays in the log, where the status janissary cannot observe for itself is what a post-mortem
  // is read for, and comes off the line the user is shown.
  it('reports the child\'s status without the browser\'s restatement of it', async () => {
    const { onGone } = await start();
    child.say('chromium exited (signal SIGKILL)\n');
    child.handlers.get('exit')?.(1, null);
    const [message, log] = onGone.mock.calls[0] as [string, string];
    expect(message).toBe('e2e browser exited (code 1)');
    expect(log).toBe('e2e browser exited (code 1)\nchromium exited (signal SIGKILL)');
  });

  it('keeps what the browser said above its end report', async () => {
    const { onGone } = await start();
    child.say('sandbox-exec: profile could not be compiled\nchromium exited (code 1)\n');
    child.handlers.get('exit')?.(1, null);
    expect(onGone).toHaveBeenCalledWith(
      'e2e browser exited (code 1)\nsandbox-exec: profile could not be compiled',
      expect.any(String),
    );
  });

  it('carries it into a failed start too', async () => {
    const { onGone } = await start();
    child.say('sandbox-exec: profile could not be compiled\n');
    child.handlers.get('error')?.(new Error('ENOENT'));
    expect(onGone).toHaveBeenCalledWith(
      'e2e browser failed to start: ENOENT\nsandbox-exec: profile could not be compiled',
      expect.any(String),
    );
  });

  // A guard that cannot listen is the tab's failure rather than the browser's, and the browser behind
  // it is released with it — so the report names the guard failure on its own. What a browser said on
  // its way out of a launch that never came up is a different case, and rides along there.
  it('names the guard failure alone, since the browser behind it never failed', async () => {
    const { onGone } = await start();
    child.say('chromium: crashed on startup\n');
    const guardOptions = mocks.startE2EGuard.mock.calls[0][0] as { onError: (message: string) => void };
    guardOptions.onError('e2e browser guard failed to listen: EADDRINUSE');
    expect(onGone).toHaveBeenCalledWith('e2e browser guard failed to listen: EADDRINUSE', undefined);
  });

  // Read before the release kills the child, or the message would describe a browser it had already
  // taken the evidence away from.
  it('reads the child\'s output before killing it', async () => {
    const { onGone } = await start();
    child.say('last words\n');
    child.handlers.get('exit')?.();
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(onGone).toHaveBeenCalledWith(expect.stringContaining('last words'), expect.any(String));
  });

  it('says nothing extra for a browser the user closed', async () => {
    const { onGone, handle } = await start();
    child.say('shutting down\n');
    handle.close();
    expect(onGone).not.toHaveBeenCalled();
  });
});

// A crash trace is longer than the tail the message is held to, so the frames naming where the
// browser faulted are exactly the ones the message drops. The log beside it is the same account
// with nothing dropped, for a caller that can put it where the whole of it fits.
describe('startE2EBrowserServer keeping the whole account', () => {
  function crashTrace(): string {
    const frames = Array.from({ length: 40 }, (_, index) => `#${index} 0x00000001 chrome::Frame${index}()`);
    return `Received signal 11 SEGV_MAPERR\n${frames.join('\n')}\n`;
  }

  it('keeps the frames the message\'s tail drops', async () => {
    const { onGone } = await start();
    child.say(crashTrace());
    child.handlers.get('exit')?.(null, 'SIGSEGV');

    const [message, log] = onGone.mock.calls[0] as [string, string];
    expect(message).not.toContain('Received signal 11 SEGV_MAPERR');
    expect(message).not.toContain('chrome::Frame0()');
    expect(log).toContain('Received signal 11 SEGV_MAPERR');
    expect(log).toContain('chrome::Frame0()');
    expect(log).toContain('chrome::Frame39()');
  });

  it('leads the log with the same report the message opens with', async () => {
    const { onGone } = await start();
    child.say(crashTrace());
    child.handlers.get('exit')?.(null, 'SIGSEGV');

    const [, log] = onGone.mock.calls[0] as [string, string];
    expect(log.startsWith('e2e browser exited (signal SIGSEGV)\n')).toBe(true);
  });

  it('writes no log for a browser that said nothing', async () => {
    const { onGone } = await start();
    child.handlers.get('exit')?.(null, 'SIGSEGV');

    expect(onGone).toHaveBeenCalledWith('e2e browser exited (signal SIGSEGV)', undefined);
  });

  // The trace is the evidence and the end report beneath it is not, so the line that comes off the
  // message is the second one — and the log still holds both.
  it('reports a crash trace and not the end report below it', async () => {
    const { onGone } = await start();
    child.say(`${crashTrace()}chromium exited (signal SIGSEGV)\n`);
    child.handlers.get('exit')?.(1, null);

    const [message, log] = onGone.mock.calls[0] as [string, string];
    expect(message).toContain('chrome::Frame39()');
    expect(message).not.toContain('chromium exited (signal SIGSEGV)');
    expect(log).toContain('chromium exited (signal SIGSEGV)');
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

  // A guard that cannot listen takes the browser behind it down with it, so the live browser's own
  // directory goes too: nothing can reach that Chromium, so its files are not evidence of anything.
  it('releases everything when the guard cannot listen', async () => {
    await start();
    guardCall().onError('e2e browser guard failed to listen: EADDRINUSE');
    expect(released()).toEqual({ guard: 1, child: 1, scratch: 1 });
    expect(mocks.releasedPorts).toEqual([guardCall().port, internalPort()]);
  });

  // A browser that ends on its own releases what it held, which is the child and its ports' half of
  // the tab's; the guard and the ports outlive it, because the tab is still open to be asked again.
  it('releases the browser but keeps the guard when the child exits unexpectedly', async () => {
    await start();
    child.handlers.get('exit')?.();
    expect(released()).toEqual({ guard: 0, child: 1, scratch: 0 });
  });

  it('releases the browser but keeps the guard when the child never starts', async () => {
    await start();
    child.handlers.get('error')?.(new Error('ENOENT'));
    expect(released()).toEqual({ guard: 0, child: 1, scratch: 0 });
  });

  // Nothing was acquired by a start that failed, so there is nothing to roll back — least of all the
  // guard, which is the tab's and is still serving the endpoint a later connect will arrive at.
  it('keeps the guard and its ports when the spawn throws, and keeps the directory', async () => {
    mocks.spawn.mockImplementation(() => { throw new Error('spawn refused'); });
    await start();
    expect(guardClose).not.toHaveBeenCalled();
    expect(mocks.scratchRemove).not.toHaveBeenCalled();
    expect(mocks.releasedPorts).toEqual([]);
  });

  // The guard is listening before a browser is asked for, so a scratch directory it cannot allocate
  // is the start's failure and not the tab's: the report goes out and the tab carries on.
  it('reports a scratch allocation that fails instead of throwing at its caller', async () => {
    mocks.allocateBrowserScratch.mockImplementation(() => { throw new Error('EACCES'); });
    const { onGone, handle } = await start();
    expect(onGone).toHaveBeenCalledWith(expect.stringContaining('EACCES'), undefined);
    expect(mocks.startE2EGuard).toHaveBeenCalledTimes(1);
    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(() => handle.close()).not.toThrow();
  });

  // Closing the tab is the first thing a user does after being told the browser is gone. If that
  // removed the directory, the post-mortem would go with the reflex that follows reading about it —
  // and the release happens once, because the death already gave the browser's own half back.
  it('releases once across a failure followed by a close, and still keeps the directory', async () => {
    const { onGone, handle } = await start();
    child.handlers.get('exit')?.();
    handle.close();
    expect(released()).toEqual({ guard: 1, child: 1, scratch: 0 });
    expect(onGone).toHaveBeenCalledTimes(1);
  });

  it('releases once across a close followed by the child\'s exit', async () => {
    const { onGone, handle } = await start();
    handle.close();
    child.handlers.get('exit')?.();
    expect(released()).toEqual({ guard: 1, child: 1, scratch: 1 });
    expect(onGone).not.toHaveBeenCalled();
  });
});
