import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';
import { BROWSER_PORT_BAND_FIRST, BROWSER_PORT_BAND_LAST } from './browser-ports.js';
import { sandboxAvailable, sandboxSpawn } from './index.js';

// A band port has to be bound by number rather than by asking for port 0 — the whole point is which
// port it is. A host already using one is the one case this cannot test around, so it is skipped
// rather than failed.
function listen(server: Server, port: number): Promise<number | undefined> {
  return new Promise((resolve) => {
    server.once('error', () => resolve(undefined));
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      resolve(!address || typeof address === 'string' ? undefined : address.port);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => { if (error) reject(error); else resolve(); });
  });
}

describe.skipIf(!sandboxAvailable())('sandboxSpawn browser port boundary (darwin only)', () => {
  let workspaceDir: string;
  let tmpDir: string;
  let first: Server;
  let second: Server;
  let outside: Server;

  beforeEach(() => {
    loadConfig(mkdtempSync(path.join(tmpdir(), 'sandbox-cfg-')));
    workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-browser-port-'));
    tmpDir = `${workspaceDir}.tmp`;
    mkdirSync(tmpDir, { recursive: true });
    first = createServer();
    second = createServer();
    outside = createServer();
  });

  afterEach(async () => {
    await Promise.all([close(first), close(second), close(outside)]);
    rmSync(workspaceDir, { recursive: true, force: true });
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // One workspaced spawn that owns no browser at all: it is denied both band ports, which is the
  // case a parameterized deny bound from one launch's own port could never cover. Everything outside
  // the band — the guard's port, and any other loopback service the harness uses — stays reachable.
  it('denies every port in the browser band, from a spawn that owns none of them', async () => {
    const [firstPort, secondPort, outsidePort] = await Promise.all([
      listen(first, BROWSER_PORT_BAND_FIRST),
      listen(second, BROWSER_PORT_BAND_LAST),
      listen(outside, BROWSER_PORT_BAND_FIRST - 1),
    ]);
    if (firstPort === undefined || secondPort === undefined || outsidePort === undefined) return;
    const connect = (port: number) => {
      const result = sandboxSpawn(
        { workspaceDir }, '/usr/bin/nc', ['-z', '-w', '1', '127.0.0.1', String(port)],
      );
      return () => execFileSync(result.command, result.args, {
        cwd: workspaceDir, env: result.env as NodeJS.ProcessEnv, stdio: 'pipe',
      });
    };

    expect(connect(firstPort)).toThrow();
    expect(connect(secondPort)).toThrow();
    expect(connect(outsidePort)).not.toThrow();
  });
});
