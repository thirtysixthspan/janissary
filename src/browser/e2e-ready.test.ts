import { describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:net';
import { E2E_LOOPBACK_HOST } from './e2e-loopback.js';
import { newSession, stopSession, type E2ESession } from './e2e-session.js';
import { waitForListening } from './e2e-ready.js';

// The wait that turns a spawn into a browser. Everything here is a real socket on a port the OS
// hands out, because the thing being pinned is that a probe against an unbound port is refused and a
// probe against a bound one is not — which a stub could only claim.

type Listener = { port: number; close: () => Promise<void> };

// Bind nothing yet, and hand back the port: a case that needs a port that is not accepting starts
// from here. Nothing has connected to it, so there is no TIME_WAIT to keep it from being bound again.
async function unboundPort(): Promise<number> {
  const taken = await listening();
  const { port } = taken;
  await taken.close();
  return port;
}

async function listening(): Promise<Listener> {
  const server = createServer();
  server.unref();
  server.listen(0, E2E_LOOPBACK_HOST);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  return { port: (server.address() as { port: number }).port, close: () => shut(server) };
}

function shut(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

// Long enough for the probe to have run several times, short enough to keep the suite quick.
const PATIENCE = 60;

const session = (): E2ESession => newSession(vi.fn());

async function settled(promise: Promise<unknown>): Promise<boolean> {
  const answer = { done: false };
  void promise.then(() => { answer.done = true; }, () => { answer.done = true; });
  await new Promise((resolve) => setTimeout(resolve, PATIENCE));
  return answer.done;
}

describe('waitForListening', () => {
  it('resolves against a port that is already accepting', async () => {
    const browser = await listening();
    try {
      await expect(waitForListening(session(), browser.port)).resolves.toBeUndefined();
    } finally {
      await browser.close();
    }
  });

  it('keeps waiting while nothing is listening, and resolves the moment a child binds', async () => {
    const port = await unboundPort();
    const browser = createServer();
    const pending = waitForListening(session(), port);
    expect(await settled(pending)).toBe(false);
    browser.listen(port, E2E_LOOPBACK_HOST);
    await new Promise<void>((resolve) => browser.once('listening', resolve));
    try {
      await expect(pending).resolves.toBeUndefined();
    } finally {
      await shut(browser);
    }
  });

  // The case the wait exists for: a child that fails to launch exits after the spawn returned, and
  // its exit is the only account of why the port is not coming.
  it('rejects with the exit itself when the child is gone before the port is bound', async () => {
    const port = await unboundPort();
    const dead = session();
    const pending = waitForListening(dead, port);
    stopSession(dead, 'e2e browser exited');
    await expect(pending).rejects.toThrow('e2e browser exited before it was listening');
  });

  it('ends the wait on its bound rather than holding it open forever', async () => {
    const port = await unboundPort();
    await expect(waitForListening(session(), port, PATIENCE)).rejects.toThrow('e2e browser did not start listening in time');
  });
});
