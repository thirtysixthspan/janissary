import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { randomInt } from 'node:crypto';
import {
  BROWSER_PORT_BAND_COUNT, BROWSER_PORT_BAND_FIRST, BROWSER_PORT_BAND_LAST, isBrowserBandPort,
} from '../sandbox/browser-ports.js';
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

// The band is what the Seatbelt harness profile denies statically, so a browser port outside it
// would be reachable from every confined harness on the host — and a guard port inside it would be
// unreachable from the harness that owns it.
describe('allocateBrowserPorts and the denied band', () => {
  // The guard range is derived as "the dynamic range minus the band", which is only one contiguous
  // interval while the band is that range's tail. Moving the band without moving this would hand out
  // guard ports that overlap it.
  it('places the band at the very top of the dynamic range', () => {
    expect(BROWSER_PORT_BAND_LAST).toBe(LAST_PORT);
    expect(BROWSER_PORT_BAND_FIRST).toBeGreaterThan(FIRST_PORT);
  });

  it('draws every browser port from the band and no guard port from it', () => {
    for (let i = 0; i < 8; i++) {
      const ports = allocate();
      expect(isBrowserBandPort(ports.browserPort)).toBe(true);
      expect(isBrowserBandPort(ports.guardPort)).toBe(false);
    }
  });

  // The draw is normalized into its own range before the walk, so a value from the wrong range
  // cannot carry a port out of it. Without that, JavaScript's signed `%` walks backwards.
  it('keeps the guard out of the band even when its draw lands inside it', () => {
    vi.mocked(randomInt).mockReturnValue(BROWSER_PORT_BAND_FIRST + 20 as never);
    const ports = allocate();
    expect(ports.browserPort).toBe(BROWSER_PORT_BAND_FIRST + 20);
    expect(isBrowserBandPort(ports.guardPort)).toBe(false);
  });

  it('fills the band and then throws, naming it, rather than binding outside it', () => {
    const all = new Set<number>();
    for (let i = 0; i < BROWSER_PORT_BAND_COUNT; i++) all.add(allocate().browserPort);
    expect(all.size).toBe(BROWSER_PORT_BAND_COUNT);
    expect(() => allocateBrowserPorts())
      .toThrow(`no free e2e browser port between ${BROWSER_PORT_BAND_FIRST} and ${BROWSER_PORT_BAND_LAST}`);
  });

  // A rejected launch must reserve nothing, or the band would shed a usable port on every refusal.
  // Releasing one launch afterwards therefore hands the very next allocation that exact pair back.
  it('leaves the pool untouched when the full band rejects a launch', () => {
    for (let i = 0; i < BROWSER_PORT_BAND_COUNT; i++) allocate();
    const [first] = live;
    const released = [first.guardPort, first.browserPort];
    expect(() => allocateBrowserPorts()).toThrow();
    first.release();
    const next = allocate();
    expect([next.guardPort, next.browserPort]).toEqual(released);
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
