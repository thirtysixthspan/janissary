import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const install = vi.hoisted(() => ({ root: '' }));

vi.mock('../janissary-root.js', () => ({ janissaryRoot: () => install.root }));

import { locateAcpCommand } from './command-path.js';

const originalShell = process.env.SHELL;
const serverNodeDir = path.dirname(process.execPath);
let roots: string[] = [];

// A stand-in for the user's shell: it adds `binDir` ahead of `basePath` on PATH, as an rc file would,
// and runs the last argument it is given as the command. The default base is the inherited PATH.
function userShellAdding(binDir: string, banner = '', basePath = '$PATH'): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'janissary-acp-path-'));
  roots.push(directory);
  const shell = path.join(directory, 'user-shell');
  writeFileSync(shell, `#!/bin/sh\necho '${banner}'\nPATH="${binDir}:${basePath}"; export PATH\nfor last; do :; done\nexec /bin/sh -c "$last"\n`, { mode: 0o755 });
  return shell;
}

function binDirWith(name: string): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'janissary-acp-bin-'));
  roots.push(directory);
  const binDir = path.join(directory, 'bin');
  mkdirSync(binDir);
  writeFileSync(path.join(binDir, name), '#!/bin/sh\n', { mode: 0o755 });
  return binDir;
}

// A stand-in install root whose `node_modules/.bin` holds the given executables, each a script with
// the given body.
function installRootWith(names: string[], body = '#!/bin/sh\n'): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'janissary-acp-install-'));
  roots.push(directory);
  const binDir = path.join(directory, 'node_modules', '.bin');
  mkdirSync(binDir, { recursive: true });
  for (const name of names) writeFileSync(path.join(binDir, name), body, { mode: 0o755 });
  return directory;
}

beforeEach(() => {
  install.root = installRootWith(['claude-agent-acp']);
});

afterEach(() => {
  if (originalShell === undefined) delete process.env.SHELL;
  else process.env.SHELL = originalShell;
  for (const directory of roots) rmSync(directory, { recursive: true, force: true });
  roots = [];
});

describe('locateAcpCommand', () => {
  it('leaves a command given as a path alone', () => {
    const env = { PATH: '/usr/bin:/bin' };

    expect(locateAcpCommand('/opt/agent/bin/opencode', env)).toEqual({ command: '/opt/agent/bin/opencode', env });
  });

  it('leaves a command the given PATH already resolves alone', () => {
    const binDir = binDirWith('opencode');
    process.env.SHELL = userShellAdding('/nonexistent');
    const env = { PATH: `/usr/bin:${binDir}` };

    expect(locateAcpCommand('opencode', env)).toEqual({ command: 'opencode', env });
  });

  it('resolves a command only the user\'s interactive shell finds, despite a banner', () => {
    const binDir = binDirWith('opencode');
    process.env.SHELL = userShellAdding(binDir, 'Welcome back', '/nonexistent-a');

    const located = locateAcpCommand('opencode', { PATH: '/usr/bin:/bin', OTHER: 'kept' });

    expect(located.command).toBe(path.join(binDir, 'opencode'));
    expect(located.env.PATH).toBe(`${binDir}:/nonexistent-a`);
    expect(located.env.PATH?.split(':')).not.toContain(serverNodeDir);
    expect(located.env.OTHER).toBe('kept');
  });

  it('leaves a command nothing resolves alone, so the spawn reports it', () => {
    process.env.SHELL = userShellAdding(binDirWith('something-else'));
    const env = { PATH: '/usr/bin:/bin' };

    expect(locateAcpCommand('janissary-missing-agent', env)).toEqual({ command: 'janissary-missing-agent', env });
  });

  it('resolves a command the install bundles to its absolute path, putting the server\'s node first on PATH', () => {
    process.env.SHELL = userShellAdding('/nonexistent');
    const env = { PATH: '/nonexistent-a:/nonexistent-b', OTHER: 'kept' };

    const located = locateAcpCommand('claude-agent-acp', env);

    expect(located.command).toBe(path.join(install.root, 'node_modules', '.bin', 'claude-agent-acp'));
    expect(located.env).toEqual({ PATH: `${serverNodeDir}:/nonexistent-a:/nonexistent-b`, OTHER: 'kept' });
    expect(env.PATH).toBe('/nonexistent-a:/nonexistent-b');
  });

  it('prefers the bundled copy even when the given PATH also resolves the command', () => {
    const binDir = binDirWith('claude-agent-acp');
    process.env.SHELL = userShellAdding('/nonexistent');
    const env = { PATH: `/nonexistent-a:${binDir}` };

    const located = locateAcpCommand('claude-agent-acp', env);

    expect(located.command).toBe(path.join(install.root, 'node_modules', '.bin', 'claude-agent-acp'));
    expect(located.env).toEqual({ PATH: `${serverNodeDir}:/nonexistent-a:${binDir}` });
  });

  it('keeps the environment of a bundled command whose PATH already lists the server\'s node', () => {
    const env = { PATH: `/nonexistent-a:${serverNodeDir}` };

    const located = locateAcpCommand('claude-agent-acp', env);

    expect(located.command).toBe(path.join(install.root, 'node_modules', '.bin', 'claude-agent-acp'));
    expect(located.env).toBe(env);
  });

  it('keeps the environment of a bundled command whose PATH reaches the server\'s node through a symlink', () => {
    const linkDir = mkdtempSync(path.join(os.tmpdir(), 'janissary-acp-node-link-'));
    roots.push(linkDir);
    symlinkSync(process.execPath, path.join(linkDir, 'node'));
    const env = { PATH: `${linkDir}:/nonexistent-a` };

    const located = locateAcpCommand('claude-agent-acp', env);

    expect(located.command).toBe(path.join(install.root, 'node_modules', '.bin', 'claude-agent-acp'));
    expect(located.env).toBe(env);
  });

  it('puts the server\'s node first for a bundled command whose PATH finds a different node first', () => {
    const otherNodeDir = binDirWith('node');

    const located = locateAcpCommand('claude-agent-acp', { PATH: `${otherNodeDir}:/nonexistent-a` });

    expect(located.env).toEqual({ PATH: `${serverNodeDir}:${otherNodeDir}:/nonexistent-a` });
  });

  it('keeps the environment of a bundled command whose PATH lists the server\'s node after a different node', () => {
    const otherNodeDir = binDirWith('node');
    const env = { PATH: `${otherNodeDir}:${serverNodeDir}` };

    const located = locateAcpCommand('claude-agent-acp', env);

    expect(located.env).toBe(env);
  });

  it('gives a bundled command with no PATH the server\'s node directory as its PATH', () => {
    const located = locateAcpCommand('claude-agent-acp', { OTHER: 'kept' });

    expect(located.env).toEqual({ PATH: serverNodeDir, OTHER: 'kept' });
  });

  it('starts a bundled node script when the given PATH holds no node', () => {
    install.root = installRootWith(['codex-acp'], '#!/usr/bin/env node\nprocess.stdout.write(\'started\');\n');

    const located = locateAcpCommand('codex-acp', { PATH: '/nonexistent-a' });

    expect(execFileSync(located.command, [], { env: located.env, encoding: 'utf8' })).toBe('started');
  });

  it('leaves a bundled command given as a path alone', () => {
    const env = { PATH: '/usr/bin:/bin' };

    expect(locateAcpCommand('/opt/agent/bin/claude-agent-acp', env)).toEqual({ command: '/opt/agent/bin/claude-agent-acp', env });
  });
});
