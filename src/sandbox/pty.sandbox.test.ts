import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { loadConfig } from '../config.js';
import { sandboxAvailable, sandboxSpawn } from './index.js';

const require = createRequire(import.meta.url);
const nodePtyDir = path.dirname(require.resolve('node-pty/package.json'));

describe.skipIf(!sandboxAvailable())('sandbox node-pty allocation', () => {
  let configDir: string;
  let workspaceDir: string;
  let tmpDir: string;

  beforeEach(() => {
    configDir = mkdtempSync(path.join(tmpdir(), 'pty-cfg-'));
    loadConfig(configDir);
    workspaceDir = mkdtempSync(path.join(tmpdir(), 'pty-ws-'));
    tmpDir = `${workspaceDir}.tmp`;
    mkdirSync(tmpDir, { recursive: true });
    cpSync(nodePtyDir, path.join(workspaceDir, 'node_modules', 'node-pty'), { recursive: true });
  });

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true });
    rmSync(workspaceDir, { recursive: true, force: true });
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('allocates and uses a pty inside the profile', () => {
    const script = path.join(workspaceDir, 'pty.mjs');
    writeFileSync(script, `
import * as pty from 'node-pty';

const child = pty.spawn('/bin/sh', ['-c', 'printf sandboxed-pty'], {
  name: 'xterm-256color',
  cols: 80,
  rows: 24,
  cwd: process.cwd(),
  env: process.env,
});
child.onData((data) => process.stdout.write(data));
child.onExit(({ exitCode }) => { process.exitCode = exitCode; });
`);
    const { command, args, env } = sandboxSpawn({ workspaceDir }, process.execPath, [script]);

    const output = execFileSync(command, args, { cwd: workspaceDir, env, encoding: 'utf8', stdio: 'pipe' });

    expect(output).toBe('sandboxed-pty');
  });
});
