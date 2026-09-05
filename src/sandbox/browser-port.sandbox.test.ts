import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';
import { sandboxAvailable, sandboxSpawn } from './index.js';

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') reject(new Error('TCP server has no port'));
      else resolve(address.port);
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
  let browser: Server;
  let guard: Server;

  beforeEach(() => {
    loadConfig(mkdtempSync(path.join(tmpdir(), 'sandbox-cfg-')));
    workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-browser-port-'));
    tmpDir = `${workspaceDir}.tmp`;
    mkdirSync(tmpDir, { recursive: true });
    browser = createServer();
    guard = createServer();
  });

  afterEach(async () => {
    await Promise.all([close(browser), close(guard)]);
    rmSync(workspaceDir, { recursive: true, force: true });
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('denies the private browser port while allowing the guard port', async () => {
    const [browserPort, guardPort] = await Promise.all([listen(browser), listen(guard)]);
    const connect = (port: number) => {
      const result = sandboxSpawn(
        { workspaceDir, browserPort }, '/usr/bin/nc', ['-z', '-w', '1', '127.0.0.1', String(port)],
      );
      return () => execFileSync(result.command, result.args, {
        cwd: workspaceDir, env: result.env as NodeJS.ProcessEnv, stdio: 'pipe',
      });
    };

    expect(connect(browserPort)).toThrow();
    expect(connect(guardPort)).not.toThrow();
  });
});
