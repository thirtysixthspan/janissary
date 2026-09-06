import { describe, it, expect, vi } from 'vitest';
import {
  superviseBrowserServer, MAX_REPLACEMENTS, RELAUNCH_ATTEMPTS, RELAUNCH_DELAY_MS,
  type SupervisedServer,
} from './e2e-child-supervisor.js';

// No Chromium starts in this suite and none needs to: everything the supervisor touches is injected,
// so a fake server whose close listener the test holds is the whole world it can see.

type FakeServer = SupervisedServer & { die: () => void };

function fakeServer(): FakeServer {
  const listeners: (() => void)[] = [];
  return {
    on: (_event, listener) => { listeners.push(listener); },
    die: () => { for (const listener of listeners) listener(); },
  };
}

function harness(launches: (FakeServer | Error)[]) {
  const first = fakeServer();
  const queue = [...launches];
  const launch = vi.fn(async () => {
    const next = queue.shift();
    if (next instanceof Error) throw next;
    if (!next) throw new Error('the test scripted no further launch');
    return next;
  });
  const report = vi.fn();
  const giveUp = vi.fn();
  const delay = vi.fn(async () => {});
  superviseBrowserServer({ server: first, launch, report, giveUp, delay });
  // The supervisor's close handler is async, so a death is only fully settled once the microtask
  // queue has drained — every awaited step here resolves immediately.
  const settle = async (): Promise<void> => { for (let i = 0; i < 40; i += 1) await Promise.resolve(); };
  return { first, launch, report, giveUp, delay, settle };
}

describe('superviseBrowserServer', () => {
  it('launches nothing while the browser stays up', async () => {
    const { launch, giveUp, settle } = harness([]);
    await settle();
    expect(launch).not.toHaveBeenCalled();
    expect(giveUp).not.toHaveBeenCalled();
  });

  it('starts a replacement when the browser dies', async () => {
    const second = fakeServer();
    const { first, launch, giveUp, settle } = harness([second]);
    first.die();
    await settle();
    expect(launch).toHaveBeenCalledTimes(1);
    expect(giveUp).not.toHaveBeenCalled();
  });

  // A replacement that is not itself watched would make the second death silent and permanent.
  it('watches the replacement it started', async () => {
    const second = fakeServer();
    const third = fakeServer();
    const { first, launch, settle } = harness([second, third]);
    first.die();
    await settle();
    second.die();
    await settle();
    expect(launch).toHaveBeenCalledTimes(2);
  });

  it('absorbs deaths up to the cap', async () => {
    const servers = Array.from({ length: MAX_REPLACEMENTS }, () => fakeServer());
    const { first, launch, giveUp, settle } = harness(servers);
    let current = first;
    for (const next of servers) {
      current.die();
      await settle();
      current = next;
    }
    expect(launch).toHaveBeenCalledTimes(MAX_REPLACEMENTS);
    expect(giveUp).not.toHaveBeenCalled();
  });

  it('gives up on the death after the cap, without launching again', async () => {
    const servers = Array.from({ length: MAX_REPLACEMENTS }, () => fakeServer());
    const { first, launch, giveUp, settle } = harness(servers);
    let current = first;
    for (const next of servers) {
      current.die();
      await settle();
      current = next;
    }
    current.die();
    await settle();
    expect(launch).toHaveBeenCalledTimes(MAX_REPLACEMENTS);
    expect(giveUp).toHaveBeenCalledTimes(1);
    expect(giveUp).toHaveBeenCalledWith(expect.stringContaining(String(MAX_REPLACEMENTS)));
  });

  // Playwright closes the old listener and emits `close` without awaiting the close, so the first
  // attempt to bind the same port can lose the race. Retrying is what makes the port reusable.
  it('retries a launch that throws and keeps the replacement in one budgeted slot', async () => {
    const second = fakeServer();
    const third = fakeServer();
    const { first, launch, giveUp, settle } = harness([new Error('listen EADDRINUSE'), second, third]);
    first.die();
    await settle();
    expect(launch).toHaveBeenCalledTimes(2);
    expect(giveUp).not.toHaveBeenCalled();
    // Two launches so far but only one replacement spent, so the next death is still absorbed.
    second.die();
    await settle();
    expect(launch).toHaveBeenCalledTimes(3);
    expect(giveUp).not.toHaveBeenCalled();
  });

  it('gives up when every attempt of one replacement throws, reporting each failure', async () => {
    const failures = Array.from({ length: RELAUNCH_ATTEMPTS }, () => new Error('listen EADDRINUSE'));
    const { first, launch, report, giveUp, settle } = harness(failures);
    first.die();
    await settle();
    expect(launch).toHaveBeenCalledTimes(RELAUNCH_ATTEMPTS);
    expect(giveUp).toHaveBeenCalledWith('e2e browser could not be replaced');
    expect(report).toHaveBeenCalledWith(expect.stringContaining('listen EADDRINUSE'));
  });

  // The parent tails this output and folds it under the message the user finally reads, so the
  // history of a browser that kept dying is what makes "e2e browser exited" actionable.
  it('reports one line per replacement, numbered against the cap', async () => {
    const second = fakeServer();
    const { first, report, settle } = harness([second]);
    first.die();
    await settle();
    expect(report).toHaveBeenCalledWith(`e2e browser died; starting a replacement (1 of ${MAX_REPLACEMENTS})`);
  });

  it('waits before each attempt, since the old server may still hold the port', async () => {
    const { first, delay, settle } = harness([fakeServer()]);
    first.die();
    await settle();
    expect(delay).toHaveBeenCalledWith(RELAUNCH_DELAY_MS);
  });
});
