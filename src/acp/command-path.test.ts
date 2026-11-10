import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const install = vi.hoisted(() => ({ root: '' }));

vi.mock('../janissary-root.js', () => ({ janissaryRoot: () => install.root }));

import { locateAcpCommand } from './command-path.js';

const originalShell = process.env.SHELL;
let roots: string[] = [];

// A stand-in for the user's shell: it adds `binDir` to PATH, as an rc file would, and runs the last
// argument it is given as the command.
function userShellAdding(binDir: string, banner = ''): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'janissary-acp-path-'));
  roots.push(directory);
  const shell = path.join(directory, 'user-shell');
  writeFileSync(shell, `#!/bin/sh\necho '${banner}'\nPATH="${binDir}:$PATH"; export PATH\nfor last; do :; done\nexec /bin/sh -c "$last"\n`, { mode: 0o755 });
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

// A stand-in install root whose `node_modules/.bin` holds the given executables.
function installRootWith(...names: string[]): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'janissary-acp-install-'));
  roots.push(directory);
  const binDir = path.join(directory, 'node_modules', '.bin');
  mkdirSync(binDir, { recursive: true });
  for (const name of names) writeFileSync(path.join(binDir, name), '#!/bin/sh\n', { mode: 0o755 });
  return directory;
}

beforeEach(() => {
  install.root = installRootWith('claude-agent-acp');
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
    process.env.SHELL = userShellAdding(binDir, 'Welcome back');

    const located = locateAcpCommand('opencode', { PATH: '/usr/bin:/bin', OTHER: 'kept' });

    expect(located.command).toBe(path.join(binDir, 'opencode'));
    expect(located.env.PATH?.split(':', 1)[0]).toBe(binDir);
    expect(located.env.OTHER).toBe('kept');
  });

  it('leaves a command nothing resolves alone, so the spawn reports it', () => {
    process.env.SHELL = userShellAdding(binDirWith('something-else'));
    const env = { PATH: '/usr/bin:/bin' };

    expect(locateAcpCommand('janissary-missing-agent', env)).toEqual({ command: 'janissary-missing-agent', env });
  });

  it('resolves a command the install bundles to its absolute path, keeping the environment', () => {
    process.env.SHELL = userShellAdding('/nonexistent');
    const env = { PATH: '/usr/bin:/bin' };

    const located = locateAcpCommand('claude-agent-acp', env);

    expect(located.command).toBe(path.join(install.root, 'node_modules', '.bin', 'claude-agent-acp'));
    expect(located.env).toBe(env);
  });

  it('prefers the bundled copy even when the given PATH also resolves the command', () => {
    const binDir = binDirWith('claude-agent-acp');
    process.env.SHELL = userShellAdding('/nonexistent');
    const env = { PATH: `/usr/bin:${binDir}` };

    const located = locateAcpCommand('claude-agent-acp', env);

    expect(located.command).toBe(path.join(install.root, 'node_modules', '.bin', 'claude-agent-acp'));
    expect(located.env).toBe(env);
  });

  it('leaves a bundled command given as a path alone', () => {
    const env = { PATH: '/usr/bin:/bin' };

    expect(locateAcpCommand('/opt/agent/bin/claude-agent-acp', env)).toEqual({ command: '/opt/agent/bin/claude-agent-acp', env });
  });
});
