import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { randomInt } from 'node:crypto';
import { allocateBrowserPorts, type BrowserPorts } from './e2e-ports.js';

// Every case here stubs the draw to a constant. That is deliberate: what this module promises is
// that the pair is usable *whatever* the draw returns, and a suite that leans on two random numbers
// happening to differ is the test that fails once in CI and is never reproduced.

vi.mock('node:crypto', () => ({ randomInt: vi.fn() }));

const DRAWN = 50_000;
const FIRST_PORT = 49_152;
const LAST_PORT = 65_535;

const live: BrowserPorts[] = [];

function allocate(): BrowserPorts {
  const ports = allocateBrowserPorts();
  live.push(ports);
  return ports;
}

beforeEach(() => {
  vi.mocked(randomInt).mockReturnValue(DRAWN as never);
});

afterEach(() => {
  for (const ports of live) ports.release();
  live.length = 0;
  vi.clearAllMocks();
});

describe('allocateBrowserPorts within one launch', () => {
  // The guard and the browser drawing the same number would leave the guard proxying to its own
  // listening port. Two independent draws could always do that; this cannot.
  it('never gives the guard and the browser the same port, even on identical draws', () => {
    const ports = allocate();
    expect(ports.guardPort).not.toBe(ports.browserPort);
  });

  it('stays inside the dynamic range', () => {
    const ports = allocate();
    for (const port of [ports.guardPort, ports.browserPort]) {
      expect(port).toBeGreaterThanOrEqual(FIRST_PORT);
      expect(port).toBeLessThanOrEqual(LAST_PORT);
    }
  });
});

describe('allocateBrowserPorts across launches', () => {
  // The deterministic form of the occupied-port case: the port is occupied because this process
  // already handed it out, which is the collision Janissary causes and can therefore prevent.
  it('reuses neither port of a launch that is still live', () => {
    const first = allocate();
    const second = allocate();
    expect([second.guardPort, second.browserPort]).not.toContain(first.guardPort);
    expect([second.guardPort, second.browserPort]).not.toContain(first.browserPort);
  });

  it('gives four concurrent launches eight distinct ports', () => {
    const allocated = Array.from({ length: 4 }, () => allocate())
      .flatMap((ports) => [ports.guardPort, ports.browserPort]);
    expect(new Set(allocated).size).toBe(8);
  });
});

describe('BrowserPorts.release', () => {
  it('returns both ports, so the next launch can take them again', () => {
    const first = allocateBrowserPorts();
    const taken = [first.guardPort, first.browserPort];
    first.release();
    const second = allocate();
    expect([second.guardPort, second.browserPort]).toEqual(taken);
  });

  it('frees only its own ports', () => {
    const first = allocate();
    const second = allocateBrowserPorts();
    second.release();
    const third = allocate();
    expect([third.guardPort, third.browserPort]).not.toContain(first.guardPort);
    expect([third.guardPort, third.browserPort]).not.toContain(first.browserPort);
  });
});
