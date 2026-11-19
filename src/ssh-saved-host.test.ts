import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { SavedHost } from './plugins/hosts/hosts-values.js';
import type { SshParsed } from './ssh.js';
import { buildSavedSshInvocation, savedSshName } from './ssh-saved-host.js';

type Parsed = Extract<SshParsed, { command: string }>;

function built(host: SavedHost): Parsed {
  const result = buildSavedSshInvocation(host);
  if ('error' in result) throw new Error(result.error);
  return result;
}

describe('savedSshName', () => {
  it('reads a bare mixed-case command word', () => {
    expect(savedSshName('SSH DevBox')).toBe('DevBox');
  });

  it('returns undefined for an absent operand', () => {
    expect(savedSshName('ssh')).toBeUndefined();
    expect(savedSshName('ssh   ')).toBeUndefined();
  });

  it('leaves options with a destination to the literal parser', () => {
    expect(savedSshName('ssh -p 22 devbox')).toBeUndefined();
  });

  it('leaves a remote command after the destination to the literal parser', () => {
    expect(savedSshName('ssh devbox uptime')).toBeUndefined();
  });

  it('leaves qualified input to the literal parser', () => {
    expect(savedSshName('ssh admin@host')).toBeUndefined();
    expect(savedSshName('ssh host:2222')).toBeUndefined();
  });

  it('accepts a lone hyphen-prefixed name', () => {
    expect(savedSshName('ssh -v')).toBe('-v');
  });
});

describe('buildSavedSshInvocation fields', () => {
  it('builds a bare invocation for a host with no optional fields', () => {
    expect(built({ name: 'dev', host: 'devbox' })).toEqual({
      command: 'ssh -- devbox', destination: 'devbox', label: 'dev', options: ['--'],
    });
  });

  it('puts the optional user and port in the destination and connection arguments', () => {
    const result = built({ name: 'db', user: 'admin', host: '10.0.0.5', port: 2222 });
    expect(result.destination).toBe('admin@10.0.0.5');
    expect(result.label).toBe('db');
    expect(result.command).toBe('ssh -p 2222 -- admin@10.0.0.5');
    expect(result.options).toEqual(['-p', '2222', '--']);
  });

  it('makes a leading-hyphen destination an operand', () => {
    const result = built({ name: 'odd', host: '-weird' });
    expect(result.destination).toBe('-weird');
    expect(result.command).toBe('ssh -- -weird');
  });

  it('keeps a path remote command as one option element', () => {
    const result = built({ name: 'app', host: 'devbox', path: '/srv/app' });
    expect(result.command).toBe(`ssh -t -- devbox ${result.options[2]}`);
    expect(result.options).toHaveLength(3);
    expect(result.options.slice(0, 2)).toEqual(['-t', '--']);
    expect(result.options[2]).toMatch(/^'cd -- /);
    expect(result.options[2]).toContain('/srv/app');
    expect(result.options[2]).toContain(`exec "$SHELL" -l`);
  });
});

// The stand-ins stand in for the two shells at the boundary: a fake `ssh` first on PATH captures the
// argv the local shell hands it and runs its remote-command argument through a remote shell; the fake
// login shell reports the directory it was started in. Together they exercise the real quoting,
// `cd`, and `$HOME`/`$SHELL` expansion without opening a connection.
describe('saved ssh invocation through shell stand-ins', () => {
  let root: string;
  let binDir: string;
  let loginDir: string;
  let home: string;
  let capture: string;
  let count = 0;

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'ssh-saved-invocation-'));
    binDir = path.join(root, 'bin');
    loginDir = path.join(root, 'login');
    home = path.join(root, 'home');
    for (const dir of [binDir, loginDir, home, path.join(home, 'app'), path.join(loginDir, 'sub'), path.join(loginDir, '-odd')]) {
      mkdirSync(dir, { recursive: true });
    }
    const ssh = path.join(binDir, 'ssh');
    writeFileSync(ssh, [
      '#!/bin/bash',
      String.raw`printf '%s\n' "$@" > "$CAPTURE"`,
      'if [ "$RUN_REMOTE" = "1" ]; then',
      '  cmd="${@: -1}"',
      '  if [ "$ERREXIT" = "1" ]; then exec /bin/bash -e -c "$cmd"; fi',
      '  exec /bin/bash -c "$cmd"',
      'fi',
      '',
    ].join('\n'), { mode: 0o755 });
    chmodSync(ssh, 0o755);
    const loginShell = path.join(root, 'login-shell');
    writeFileSync(loginShell, '#!/bin/sh\nprintf \'PWD=%s\\n\' "$PWD"\n', { mode: 0o755 });
    chmodSync(loginShell, 0o755);
    capture = path.join(root, 'argv');
  });

  afterAll(() => { rmSync(root, { recursive: true, force: true }); });

  type Run = { stdout: string; stderr: string; argv: string[] };

  function launch(host: SavedHost, options: { remote?: boolean; errexit?: boolean; cwd?: string } = {}): Run {
    const command = built(host).command;
    const target = `${capture}-${count++}`;
    const result = spawnSync('/bin/bash', ['-c', command], {
      cwd: options.cwd ?? loginDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${binDir}:/usr/bin:/bin`,
        HOME: home,
        SHELL: path.join(root, 'login-shell'),
        CAPTURE: target,
        RUN_REMOTE: options.remote ? '1' : '0',
        ERREXIT: options.errexit ? '1' : '0',
      },
    });
    return {
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      argv: readFileSync(target, 'utf8').trimEnd().split('\n'),
    };
  }

  it('captures the argv for a host with no optional fields', () => {
    expect(launch({ name: 'dev', host: 'devbox' }).argv).toEqual(['--', 'devbox']);
  });

  it('captures the user and port as connection arguments', () => {
    expect(launch({ name: 'db', user: 'admin', host: '10.0.0.5', port: 2222 }).argv).toEqual([
      '-p', '2222', '--', 'admin@10.0.0.5',
    ]);
  });

  it('captures a leading-hyphen destination after the separator', () => {
    expect(launch({ name: 'odd', host: '-weird' }).argv).toEqual(['--', '-weird']);
  });

  it('captures a path remote command as one argument', () => {
    const argv = launch({ name: 'app', host: 'devbox', path: '~/app' }).argv;
    expect(argv).toHaveLength(4);
    expect(argv.slice(0, 3)).toEqual(['-t', '--', 'devbox']);
    expect(argv[3]).toContain(`cd -- "$HOME"/'app'`);
  });

  it('leaves remote home and shell expansion to the remote side', () => {
    const remote = launch({ name: 'app', host: 'devbox', path: '~/app' }).argv.at(-1) ?? '';
    expect(remote).toContain('"$HOME"/\'app\'');
    expect(remote).toContain('exec "$SHELL" -l');
    expect(remote).not.toContain(home);
    expect(remote).not.toContain(path.join(root, 'login-shell'));
  });

  it('changes into an absolute directory before the login shell', () => {
    const absolute = path.join(root, 'absolute');
    mkdirSync(absolute);
    expect(launch({ name: 'app', host: 'devbox', path: absolute }, { remote: true }).stdout)
      .toContain(`PWD=${absolute}`);
  });

  it('resolves a relative directory from the login directory', () => {
    expect(launch({ name: 'app', host: 'devbox', path: 'sub' }, { remote: true }).stdout)
      .toContain(`PWD=${path.join(loginDir, 'sub')}`);
  });

  it('resolves a bare tilde against the remote home', () => {
    expect(launch({ name: 'app', host: 'devbox', path: '~' }, { remote: true }).stdout)
      .toContain(`PWD=${home}`);
  });

  it('resolves a tilde prefix and keeps the remainder literal', () => {
    expect(launch({ name: 'app', host: 'devbox', path: '~/app' }, { remote: true }).stdout)
      .toContain(`PWD=${path.join(home, 'app')}`);
  });

  it('treats a leading-hyphen relative path as an operand', () => {
    expect(launch({ name: 'app', host: 'devbox', path: '-odd' }, { remote: true }).stdout)
      .toContain(`PWD=${path.join(loginDir, '-odd')}`);
  });

  it('reports a failed change and still starts the login shell under exit-on-error', () => {
    const missing = path.join(root, 'missing');
    const run = launch({ name: 'app', host: 'devbox', path: missing }, { remote: true, errexit: true });
    expect(run.stderr).toContain(`janissary: cannot change directory to ${missing}`);
    expect(run.stdout).toContain(`PWD=${loginDir}`);
  });
});
