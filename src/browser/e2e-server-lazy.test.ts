import { beforeEach, describe, expect, it } from 'vitest';
import {
  browserIsListening, child, e2eServerMocks, guardCall, guardClose, holdBrowserPort, internalPort,
  resetE2EServerFixture, startLazy,
} from './e2e-server-test-fixture.js';

// The connect-triggered browser. What this suite pins is that a `-b` tab costs nothing until the
// agent asks, that asking is patient rather than instant, and that a browser which dies leaves the
// endpoint exactly as it found it. No test here starts a real Chromium: the child is the stub the
// shared fixture has always used, and a connect is the guard's own supplier being called.

const mocks = e2eServerMocks();
beforeEach(resetE2EServerFixture);

// What the guard does on a client upgrade, and what the client does with the answer. The handshake
// itself is tested in `e2e-guard.test.ts`; this is the far half of it.
function connect() {
  return guardCall().ensureUpstream();
}

// Whether `promise` has settled by the time a browser would have had several goes at binding. The
// only thing asserted through it is that a connect is still waiting, so an over-long wait is as good
// an answer as a prompt one.
async function settled(promise: Promise<unknown>): Promise<boolean> {
  const answer = { done: false };
  void promise.then(() => { answer.done = true; }, () => { answer.done = true; });
  await new Promise((resolve) => setTimeout(resolve, 60));
  return answer.done;
}

describe('startLazyE2EBrowserServer before the agent connects', () => {
  it('starts the guard and no browser, so the tab costs nothing until the AI asks for one', () => {
    startLazy();
    expect(mocks.startE2EGuard).toHaveBeenCalledTimes(1);
    expect(mocks.allocateBrowserScratch).not.toHaveBeenCalled();
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  // The environment is complete at launch and names a listener that already exists, so a script
  // connecting in its first millisecond finds the guard rather than a refused port.
  it('publishes both variables, and an endpoint that is already being served', () => {
    const { env } = startLazy();
    expect(env.JANISSARY_BROWSER_WS_ENDPOINT).toBe(`ws://127.0.0.1:${guardCall().port}${guardCall().wsPath}`);
    expect(env.JANISSARY_PLAYWRIGHT).toBe('/app/node_modules/playwright/index.js');
  });

  it('reports a full band through onGone and hands back no browser variables', () => {
    mocks.portsThrow = 'no free e2e browser port between 65280 and 65535';
    const server = startLazy();
    expect(server.onGone).toHaveBeenCalledTimes(1);
    expect(server.env).toEqual({});
    expect(mocks.startE2EGuard).not.toHaveBeenCalled();
  });
});

describe('startLazyE2EBrowserServer on the first connect', () => {
  it('allocates the scratch and spawns the child behind the endpoint it already published', async () => {
    startLazy();
    const endpoint = guardCall().wsPath;
    await connect();
    expect(mocks.allocateBrowserScratch).toHaveBeenCalledWith('bot');
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    // The same guard, the same published path — what came up is behind them.
    expect(guardCall().wsPath).toBe(endpoint);
    expect(internalPort()).not.toBe(guardCall().port);
  });

  it('answers with the internal address, which never leaves the janissary process', async () => {
    startLazy();
    const upstreamUrl = await connect();
    expect(upstreamUrl).toBe(`ws://127.0.0.1:${internalPort()}${new URL(upstreamUrl).pathname}`);
    expect(upstreamUrl).not.toContain(guardCall().wsPath);
  });

  // Two clients racing the first connect are the ordinary shape of a script that opens a context and
  // a page at once. One Chromium, one start, and each client its own session once it is up.
  it('joins a second connect to the start already in flight', async () => {
    startLazy();
    const [first, second] = await Promise.all([connect(), connect()]);
    expect(first).toBe(second);
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
  });

  it('spends nothing on a connect once a browser is running', async () => {
    startLazy();
    const first = await connect();
    expect(await connect()).toBe(first);
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    expect(mocks.allocateBrowserScratch).toHaveBeenCalledTimes(1);
  });

  // The launch window the lazy start opens, and the reason the answer is held rather than guessed:
  // the guard dials the moment the supplier resolves, so a supplier that answered on the spawn would
  // be handing back a port Chromium has not bound yet.
  it('holds the connect until the browser is actually listening', async () => {
    holdBrowserPort();
    startLazy();
    const pending = connect();
    expect(await settled(pending)).toBe(false);
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    browserIsListening();
    const upstreamUrl = await pending;
    expect(upstreamUrl).toBe(`ws://127.0.0.1:${internalPort()}${new URL(upstreamUrl).pathname}`);
  });
});

describe('startLazyE2EBrowserServer when a browser will not start', () => {
  it('reports the failure the way any other death is, and keeps the guard listening', async () => {
    mocks.spawn.mockImplementation(() => { throw new Error('spawn refused'); });
    const { onGone } = startLazy();
    await expect(connect()).rejects.toThrow('spawn refused');
    expect(onGone).toHaveBeenCalledWith(expect.stringContaining('spawn refused'), undefined);
    expect(guardClose).not.toHaveBeenCalled();
    expect(mocks.releasedPorts).toEqual([]);
  });

  it('consumes nothing, so the next connect starts a browser', async () => {
    mocks.spawn.mockImplementationOnce(() => { throw new Error('spawn refused'); });
    startLazy();
    await expect(connect()).rejects.toThrow('spawn refused');
    await connect();
    expect(mocks.spawn).toHaveBeenCalledTimes(2);
    expect(mocks.allocateBrowserScratch).toHaveBeenCalledTimes(2);
  });

  // A browser that fails to launch exits after the spawn returned, so its exit is the only thing
  // that can end a wait. The client is told what happened instead of being closed for nothing.
  it('rejects with the exit itself when the child dies before it is listening', async () => {
    holdBrowserPort();
    const { onGone } = startLazy();
    const pending = connect();
    child.handlers.get('exit')?.(1, null);
    await expect(pending).rejects.toThrow('e2e browser exited before it was listening');
    expect(onGone).toHaveBeenCalledTimes(1);
    expect(onGone).toHaveBeenCalledWith('e2e browser exited (code 1)', undefined);
    expect(guardClose).not.toHaveBeenCalled();
    expect(mocks.releasedPorts).toEqual([]);
  });
});

describe('startLazyE2EBrowserServer after a browser dies', () => {
  it('fires onGone once and leaves the endpoint, the guard, and the ports alone', async () => {
    const { onGone } = startLazy();
    await connect();
    const endpoint = guardCall().wsPath;
    child.handlers.get('exit')?.();
    child.handlers.get('exit')?.();
    expect(onGone).toHaveBeenCalledTimes(1);
    expect(onGone).toHaveBeenCalledWith('e2e browser exited', undefined);
    expect(guardClose).not.toHaveBeenCalled();
    expect(mocks.releasedPorts).toEqual([]);
    expect(guardCall().wsPath).toBe(endpoint);
  });

  it('keeps the dead browser\'s directory, as a death the user did not ask for always did', async () => {
    startLazy();
    await connect();
    child.handlers.get('exit')?.();
    expect(mocks.scratchRemove).not.toHaveBeenCalled();
  });

  // The one deliberate departure from the old never-restart rule: the guard is what the agent holds
  // and it is still listening, so the next connect is a request for a browser rather than a failure.
  it('starts a fresh browser behind the same endpoint on the next connect', async () => {
    startLazy();
    const endpoint = guardCall().wsPath;
    const firstUrl = await connect();
    child.handlers.get('exit')?.();
    const secondUrl = await connect();
    expect(mocks.spawn).toHaveBeenCalledTimes(2);
    expect(mocks.allocateBrowserScratch.mock.results[1]?.value).toMatchObject({ dir: '/ws/browsers/bot-token-2' });
    // A different process in a different directory, behind the address the agent already holds: it
    // never learns a new URL, and never has to connect somewhere else to get a browser back.
    expect(secondUrl).toBe(firstUrl);
    expect(guardCall().wsPath).toBe(endpoint);
    expect(guardClose).not.toHaveBeenCalled();
  });

  it('reports the replacement dying as its own death, not as silence', async () => {
    const { onGone } = startLazy();
    await connect();
    child.handlers.get('exit')?.();
    await connect();
    child.handlers.get('exit')?.(null, 'SIGKILL');
    expect(onGone).toHaveBeenCalledTimes(2);
    expect(onGone).toHaveBeenLastCalledWith('e2e browser exited (signal SIGKILL)', undefined);
  });
});

describe('startLazyE2EBrowserServer close', () => {
  it('stops the guard and frees the ports when nothing was ever asked for', () => {
    const { handle } = startLazy();
    handle.close();
    expect(guardClose).toHaveBeenCalledTimes(1);
    expect(child.kill).not.toHaveBeenCalled();
    expect(mocks.scratchRemove).not.toHaveBeenCalled();
    expect(mocks.releasedPorts).toHaveLength(2);
  });

  it('stops the guard, kills the child, and removes the live browser\'s own directory', async () => {
    const { handle } = startLazy();
    await connect();
    handle.close();
    expect(guardClose).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(mocks.scratchRemove).toHaveBeenCalledTimes(1);
    expect(mocks.releasedPorts).toHaveLength(2);
  });

  it('is idempotent, and silent about a browser that had already died', async () => {
    const { handle, onGone } = startLazy();
    await connect();
    child.handlers.get('exit')?.();
    handle.close();
    handle.close();
    expect(guardClose).toHaveBeenCalledTimes(1);
    expect(mocks.releasedPorts).toHaveLength(2);
    expect(onGone).toHaveBeenCalledTimes(1);
  });

  it('refuses a connect that arrives after the tab closed', async () => {
    const { handle } = startLazy();
    handle.close();
    await expect(connect()).rejects.toThrow('no longer available');
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
});

// A guard that cannot listen leaves whatever is behind it with no route to it, so it has to release
// the same things a tab closing does — the eager start gets that from its one session, and the lazy
// start gets it only once the guard's failure runs the teardown the handle runs.
describe('startLazyE2EBrowserServer when the guard cannot listen', () => {
  const failed = 'e2e browser guard failed to listen: EADDRINUSE';

  it('kills the live browser, removes its directory, and frees the ports', async () => {
    const { onGone } = startLazy();
    await connect();
    guardCall().onError(failed);
    expect(guardClose).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(mocks.scratchRemove).toHaveBeenCalledTimes(1);
    expect(mocks.releasedPorts).toHaveLength(2);
    // One failure, said once: the browser that was working is released, not reported as gone too.
    expect(onGone).toHaveBeenCalledTimes(1);
    expect(onGone).toHaveBeenCalledWith(failed, undefined);
  });

  it('releases the ports and reports the guard error alone when no browser was started', () => {
    const { onGone } = startLazy();
    guardCall().onError(failed);
    expect(guardClose).toHaveBeenCalledTimes(1);
    expect(mocks.releasedPorts).toHaveLength(2);
    expect(child.kill).not.toHaveBeenCalled();
    expect(onGone).toHaveBeenCalledTimes(1);
    expect(onGone).toHaveBeenCalledWith(failed, undefined);
  });
});
