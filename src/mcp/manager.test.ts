import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { getConfig } from '../config.js';
import { loopbackReachable } from '../http-test-fixture.js';
import type { Managers } from '../managers.js';
import { deliverNotification } from '../notifications/deliver.js';
import type { Tab } from '../tab/types.js';
import { McpManager } from './manager.js';

vi.mock('../notifications/deliver.js', () => ({ deliverNotification: vi.fn() }));

const canReachLoopback = await loopbackReachable();

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

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => { probe.listen(0, '127.0.0.1', resolve); });
  const address = probe.address();
  if (address === null || typeof address === 'string') throw new Error('no probe address');
  const { port } = address;
  await new Promise<void>((resolve) => { probe.close(() => resolve()); });
  return port;
}

let root: string;
let originalPort: number | undefined;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'janus-mcp-'));
  originalPort = getConfig().mcpPort;
  delete getConfig().mcpPort;
  vi.mocked(deliverNotification).mockClear();
});

afterEach(() => {
  if (originalPort === undefined) delete getConfig().mcpPort;
  else getConfig().mcpPort = originalPort;
  rmSync(root, { recursive: true, force: true });
});

describe.skipIf(!canReachLoopback)('McpManager', () => {
  it('persists the chosen port and token with mode 0600 and reuses them on the next start', async () => {
    const managers = fixtureManagers();
    const first = new McpManager(managers, root);
    await first.ready;
    const status = first.status();
    expect(status.status).toBe('running');
    if (status.status !== 'running') throw new Error('expected a running server');

    const file = path.join(root, '.janissary', 'mcp.json');
    const saved = JSON.parse(readFileSync(file, 'utf8')) as { port: number; token: string };
    expect(saved.port).toBe(status.port);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    const launch = { url: `http://127.0.0.1:${status.port}/mcp`, token: saved.token };
    expect(first.localLaunch()).toEqual(launch);

    await first.dispose();
    const second = new McpManager(managers, root);
    await second.ready;
    expect(second.localLaunch()).toEqual(launch);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(saved);
    await second.dispose();
  });

  it('uses mcpPort instead of the saved port without writing it back', async () => {
    const managers = fixtureManagers();
    const initial = new McpManager(managers, root);
    await initial.ready;
    const file = path.join(root, '.janissary', 'mcp.json');
    const savedText = readFileSync(file, 'utf8');
    const saved = JSON.parse(savedText) as { port: number; token: string };
    await initial.dispose();

    let override = await freePort();
    while (override === saved.port) override = await freePort();
    getConfig().mcpPort = override;
    const manager = new McpManager(managers, root);
    await manager.ready;

    const status = manager.status();
    expect(status.status).toBe('running');
    if (status.status !== 'running') throw new Error('expected a running server');
    expect(status.port).toBe(override);
    expect(status.url).toBe(`http://127.0.0.1:${override}/mcp`);
    expect(manager.localLaunch()?.token).toBe(saved.token);
    expect(readFileSync(file, 'utf8')).toBe(savedText);
    await manager.dispose();
  });

  it('records one failure notification and stays down when the port is taken', async () => {
    const managers = fixtureManagers();
    const blocker = createServer();
    await new Promise<void>((resolve) => { blocker.listen(0, '127.0.0.1', resolve); });
    const address = blocker.address();
    if (address === null || typeof address === 'string') throw new Error('no blocker address');
    mkdirSync(path.join(root, '.janissary'), { recursive: true });
    writeFileSync(path.join(root, '.janissary', 'mcp.json'), JSON.stringify({
      port: address.port, token: 'saved-token',
    }));

    const manager = new McpManager(managers, root);
    try {
      await manager.ready;
      expect(manager.localLaunch()).toBeUndefined();
      const status = manager.status();
      expect(status.status).toBe('not running');
      if (status.status !== 'not running') throw new Error('expected a stopped server');
      expect(status.reason).toContain('EADDRINUSE');
      expect(deliverNotification).toHaveBeenCalledTimes(1);
      expect(vi.mocked(deliverNotification).mock.calls[0]?.[1]).toMatchObject({
        event: 'mcp-failed',
        tabLabel: 'janus',
        message: `MCP server failed to start: ${status.reason}`,
      });
    } finally {
      manager.dispose();
      await new Promise<void>((resolve) => { blocker.close(() => resolve()); });
    }
  });

  it('serves a tools/list call that returns exactly question', async () => {
    const managers = fixtureManagers();
    const manager = new McpManager(managers, root);
    await manager.ready;
    const launch = manager.localLaunch();
    if (!launch) throw new Error('expected a running server');
    try {
      const response = await fetch(launch.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${launch.token}`,
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      });
      expect(response.status).toBe(200);
      const body = await response.text();
      const data = body.split('\n').find((line) => line.startsWith('data: '));
      if (!data) throw new Error('expected a JSON-RPC response');
      const payload = JSON.parse(data.slice('data: '.length)) as { result: { tools: { name: string }[] } };
      expect(payload.result.tools.map((tool) => tool.name)).toEqual(['question']);
    } finally {
      manager.dispose();
    }
  });
});
