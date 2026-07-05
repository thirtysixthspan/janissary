import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import { loadConfig } from './config.js';
import { sandboxAvailable, sandboxSpawn } from './sandbox.js';

describe.skipIf(!sandboxAvailable())('sandboxSpawn — live sandbox-exec integration (darwin only)', () => {
  let workspaceDir: string;
  let tmpDir: string;

  beforeEach(() => {
    loadConfig(mkdtempSync(path.join(tmpdir(), 'sandbox-cfg-')));
    workspaceDir = mkdtempSync(path.join(tmpdir(), 'sandbox-ws-'));
    tmpDir = `${workspaceDir}.tmp`;
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(workspaceDir, { recursive: true, force: true });
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const runSandboxed = (script: string): { status: number } => {
    const scriptPath = path.join(workspaceDir, 'run.sh');
    writeFileSync(scriptPath, `#!/bin/sh\n${script}\n`, { mode: 0o755 });
    const { command, args, env } = sandboxSpawn({ workspaceDir }, scriptPath, []);
    try {
      execFileSync(command, args, { cwd: workspaceDir, env: env as NodeJS.ProcessEnv, stdio: 'pipe' });
      return { status: 0 };
    } catch (error) {
      const status = (error as { status?: number }).status ?? 1;
      return { status };
    }
  };

  it('allows writing inside the workspace and its TMPDIR', () => {
    const result = runSandboxed(`echo hi > "${workspaceDir}/ok.txt" && echo hi > "${tmpDir}/ok.txt"`);
    expect(result.status).toBe(0);
    expect(existsSync(path.join(workspaceDir, 'ok.txt'))).toBe(true);
    expect(existsSync(path.join(tmpDir, 'ok.txt'))).toBe(true);
  });

  it('denies writing outside the workspace', () => {
    const outside = mkdtempSync(path.join(tmpdir(), 'sandbox-outside-'));
    const result = runSandboxed(`echo escape > "${outside}/bad.txt"`);
    expect(result.status).not.toBe(0);
    expect(existsSync(path.join(outside, 'bad.txt'))).toBe(false);
    rmSync(outside, { recursive: true, force: true });
  });

  it('an ancestor package.json probe from a nested workspace reports ENOENT, not EPERM', () => {
    // A fake ancestor chain laid out the way production nests workspaces, two levels deep —
    // <grandparent>/<parent-repo>/.janissary/workspace/<name> — since cosmiconfig-based tools
    // (stylelint, eslint, prettier, postcss) and Node's own module resolution walk arbitrarily
    // far up looking for package.json, not just one level. This used to need a dedicated carve-in
    // (see prior sandbox-profile.ts history); now the general errno-ENOENT-on-$HOME-deny handles
    // it for free — the ancestor package.json isn't actually readable, but the denial looks like
    // a normal missing file instead of crashing the walk with EPERM. Must live under $HOME —
    // that's the only region denied by default, so a tmpdir-based tree would prove nothing.
    const grandparent = mkdtempSync(path.join(homedir(), '.janissary-sandbox-test-'));
    writeFileSync(path.join(grandparent, 'package.json'), '{"name":"grandparent"}');
    const repoRoot = path.join(grandparent, 'repo');
    mkdirSync(path.join(repoRoot, '.git'), { recursive: true });
    writeFileSync(path.join(repoRoot, 'package.json'), '{"name":"parent"}');
    const nestedWorkspace = path.join(repoRoot, '.janissary', 'workspace', 'ws');
    mkdirSync(nestedWorkspace, { recursive: true });
    mkdirSync(`${nestedWorkspace}.tmp`, { recursive: true });

    const stderrOf = (target: string): string => {
      const scriptPath = path.join(nestedWorkspace, 'run.sh');
      writeFileSync(scriptPath, `#!/bin/sh\ncat "${target}"\n`, { mode: 0o755 });
      const { command, args, env } = sandboxSpawn({ workspaceDir: nestedWorkspace }, scriptPath, []);
      try {
        execFileSync(command, args, { cwd: nestedWorkspace, env: env as NodeJS.ProcessEnv, stdio: 'pipe' });
        return '';
      } catch (error) {
        return (error as { stderr?: Buffer }).stderr?.toString() ?? '';
      }
    };

    for (const target of [path.join(repoRoot, 'package.json'), path.join(grandparent, 'package.json')]) {
      const stderr = stderrOf(target);
      expect(stderr).toContain('No such file or directory');
      expect(stderr).not.toContain('Operation not permitted');
    }
    rmSync(grandparent, { recursive: true, force: true });
  });

  it('denied $HOME reads report ENOENT (looks missing), not EPERM (looks forbidden)', () => {
    const outside = mkdtempSync(path.join(homedir(), '.janissary-sandbox-test-'));
    writeFileSync(path.join(outside, 'secrets.txt'), 'deny me');
    const scriptPath = path.join(workspaceDir, 'run.sh');
    writeFileSync(scriptPath, `#!/bin/sh\ncat "${path.join(outside, 'secrets.txt')}"\n`, { mode: 0o755 });
    const { command, args, env } = sandboxSpawn({ workspaceDir }, scriptPath, []);
    try {
      execFileSync(command, args, { cwd: workspaceDir, env: env as NodeJS.ProcessEnv, stdio: 'pipe' });
      expect.unreachable('expected the read to be denied');
    } catch (error) {
      const stderr = (error as { stderr?: Buffer }).stderr?.toString() ?? '';
      expect(stderr).toContain('No such file or directory');
      expect(stderr).not.toContain('Operation not permitted');
    }
    rmSync(outside, { recursive: true, force: true });
  });

  it('denies exec of a script copied to /tmp', () => {
    const tmpScript = path.join('/tmp', `sandbox-exec-test-${Date.now()}.sh`);
    writeFileSync(tmpScript, '#!/bin/sh\necho ran\n', { mode: 0o755 });
    const { command, args } = sandboxSpawn({ workspaceDir }, tmpScript, []);
    expect(() => execFileSync(command, args, { cwd: workspaceDir, stdio: 'pipe' })).toThrow();
    rmSync(tmpScript, { force: true });
  });
});
