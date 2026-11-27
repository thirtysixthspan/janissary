import { randomInt } from 'node:crypto';
import type * as NodeCrypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { allocateBrowserPorts } from '../browser/e2e-ports.js';
import { getConfig } from '../config.js';
import { harnessSpawnEnv } from '../harness/scratch-dir.js';
import { loopbackReachable } from '../http-test-fixture.js';
import type { Managers } from '../managers.js';
import { deliverNotification } from '../notifications/deliver.js';
import {
  BROWSER_PORT_BAND_COUNT, BROWSER_PORT_BAND_FIRST, isBrowserBandPort,
} from '../sandbox/browser/ports.js';
import type { Tab } from '../tab/types.js';
import { McpManager } from './manager.js';

vi.mock('../notifications/deliver.js', () => ({ deliverNotification: vi.fn() }));
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeCrypto>();
  return { ...actual, randomInt: vi.fn() };
});

const canReachLoopback = await loopbackReachable();
const GUARD_FIRST = 49_152;
const usedPorts = new Set<number>();

function fixtureManagers(): Managers {
  const tabs = [{ label: 'build', dotColor: '#fff', log: [] }] as unknown as Tab[];
  return {
    tab: {
      tabs,
      cur: () => tabs[0],
      byLabel: (label: string) => tabs.find((tab) => tab.label === label),
    },
    questions: { register: vi.fn(async () => 'answer') },
  } as unknown as Managers;
}

// A band draw of FIRST + offset normalizes to guard port GUARD_FIRST + offset. Find one that is
// actually free before forcing the draw, so the test never fails on an unrelated local listener.
async function freeBandDraw(): Promise<{ drawn: number; port: number }> {
  for (let offset = 0; offset < BROWSER_PORT_BAND_COUNT; offset++) {
    const port = GUARD_FIRST + offset;
    if (usedPorts.has(port)) continue;
    const probe = createServer();
    const bound = await new Promise<boolean>((resolve) => {
      probe.once('error', () => resolve(false));
      probe.listen(port, '127.0.0.1', () => resolve(true));
    });
    await new Promise<void>((resolve) => { probe.close(() => resolve()); });
    if (bound) {
      usedPorts.add(port);
      return { drawn: BROWSER_PORT_BAND_FIRST + offset, port };
    }
  }
  throw new Error('no free reachable guard port');
}

let root: string;
let originalPort: number | undefined;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'janus-mcp-port-'));
  originalPort = getConfig().mcpPort;
  delete getConfig().mcpPort;
  vi.mocked(randomInt).mockReturnValue(50_000 as never);
  vi.mocked(deliverNotification).mockClear();
});

afterEach(() => {
  if (originalPort === undefined) delete getConfig().mcpPort;
  else getConfig().mcpPort = originalPort;
  rmSync(root, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe.skipIf(!canReachLoopback)('McpManager first-start port selection', () => {
  it('binds and persists a reachable port outside the denied band when the draw lands inside it', async () => {
    const { drawn, port } = await freeBandDraw();
    vi.mocked(randomInt).mockReturnValue(drawn as never);
    const manager = new McpManager(fixtureManagers(), root);
    try {
      await manager.ready;
      const status = manager.status();
      expect(status.status).toBe('running');
      if (status.status !== 'running') throw new Error('expected a running server');

      const saved = JSON.parse(readFileSync(path.join(root, '.janissary', 'mcp.json'), 'utf8')) as {
        port: number; token: string;
      };
      expect(saved.port).toBe(port);
      expect(isBrowserBandPort(saved.port)).toBe(false);
      expect(saved.port).toBeLessThan(BROWSER_PORT_BAND_FIRST);

      const { env } = harnessSpawnEnv({
        name: 'claude', cwd: root, label: 'test', browser: false,
        mcp: manager.localLaunch(), onBrowserGone: vi.fn(), onBrowserStarted: vi.fn(),
      });
      const handed = Number(new URL(env?.JANISSARY_MCP_URL ?? 'http://127.0.0.1:0/mcp').port);
      expect(handed).toBe(saved.port);
      expect(isBrowserBandPort(handed)).toBe(false);

      const browser = allocateBrowserPorts();
      try {
        expect(browser.guardPort).not.toBe(saved.port);
      } finally {
        browser.release();
      }
    } finally {
      manager.dispose();
    }
  });

  it('releases the reservation when the drawn port is already occupied', async () => {
    const { drawn, port } = await freeBandDraw();
    vi.mocked(randomInt).mockReturnValue(drawn as never);
    const blocker = createServer();
    await new Promise<void>((resolve) => { blocker.listen(port, '127.0.0.1', resolve); });
    try {
      const manager = new McpManager(fixtureManagers(), root);
      await manager.ready;
      expect(manager.localLaunch()).toBeUndefined();
      const browser = allocateBrowserPorts();
      try {
        expect(browser.guardPort).toBe(port);
      } finally {
        browser.release();
      }
      manager.dispose();
    } finally {
      await new Promise<void>((resolve) => { blocker.close(() => resolve()); });
    }
  });
});

function writeSavedPort(port: number): void {
  const dir = path.join(root, '.janissary');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'mcp.json'), JSON.stringify({ port, token: 'saved-token' }));
}

function guardPortFor(drawn: number): number {
  vi.mocked(randomInt).mockReturnValue(drawn as never);
  const browser = allocateBrowserPorts();
  browser.release();
  return browser.guardPort;
}

async function runningOn(manager: McpManager, port: number): Promise<void> {
  await manager.ready;
  const status = manager.status();
  expect(status.status).toBe('running');
  if (status.status !== 'running') throw new Error('expected a running server');
  expect(status.port).toBe(port);
}

describe.skipIf(!canReachLoopback)('McpManager port reservation on later starts', () => {
  it('reserves a reused saved port so a guard draw landing on it is handed another', async () => {
    const { drawn, port } = await freeBandDraw();
    writeSavedPort(port);
    const manager = new McpManager(fixtureManagers(), root);
    try {
      await runningOn(manager, port);
      expect(guardPortFor(drawn)).not.toBe(port);
    } finally {
      manager.dispose();
    }
  });

  it('reserves an mcpPort override so a guard draw landing on it is handed another', async () => {
    const { drawn, port } = await freeBandDraw();
    getConfig().mcpPort = port;
    const manager = new McpManager(fixtureManagers(), root);
    try {
      await runningOn(manager, port);
      expect(guardPortFor(drawn)).not.toBe(port);
    } finally {
      manager.dispose();
    }
  });

  it('returns the saved port to the pool when the server is disposed', async () => {
    const { drawn, port } = await freeBandDraw();
    writeSavedPort(port);
    const manager = new McpManager(fixtureManagers(), root);
    await runningOn(manager, port);
    manager.dispose();
    expect(guardPortFor(drawn)).toBe(port);
  });

  it('returns the saved port to the pool when it is already occupied', async () => {
    const { drawn, port } = await freeBandDraw();
    writeSavedPort(port);
    const blocker = createServer();
    await new Promise<void>((resolve) => { blocker.listen(port, '127.0.0.1', resolve); });
    try {
      const manager = new McpManager(fixtureManagers(), root);
      await manager.ready;
      expect(manager.localLaunch()).toBeUndefined();
      expect(guardPortFor(drawn)).toBe(port);
      manager.dispose();
    } finally {
      await new Promise<void>((resolve) => { blocker.close(() => resolve()); });
    }
  });
});
