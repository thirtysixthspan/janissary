import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { sandboxAvailable, sandboxSpawn } from './index.js';

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

  it('allows reading any package.json under $HOME at any depth, but nothing else', () => {
    // A fake ancestor chain laid out the way production nests workspaces, two levels deep —
    // <grandparent>/<parent-repo>/.janissary/workspace/<name> — since cosmiconfig-based tools
    // (stylelint, eslint, prettier, postcss) and Node's own module resolution walk arbitrarily
    // far up looking for package.json, not just one level. Must live under $HOME — that's the
    // only region denied by default, so a tmpdir-based tree would prove nothing.
    const grandparent = mkdtempSync(path.join(homedir(), '.janissary-sandbox-test-'));
    writeFileSync(path.join(grandparent, 'package.json'), '{"name":"grandparent"}');
    writeFileSync(path.join(grandparent, 'secrets.txt'), 'deny me');
    const repoRoot = path.join(grandparent, 'repo');
    mkdirSync(path.join(repoRoot, '.git'), { recursive: true });
    writeFileSync(path.join(repoRoot, 'package.json'), '{"name":"parent"}');
    const nestedWorkspace = path.join(repoRoot, '.janissary', 'workspace', 'ws');
    mkdirSync(nestedWorkspace, { recursive: true });
    mkdirSync(`${nestedWorkspace}.tmp`, { recursive: true });

    const run = (script: string): boolean => {
      const scriptPath = path.join(nestedWorkspace, 'run.sh');
      writeFileSync(scriptPath, `#!/bin/sh\n${script}\n`, { mode: 0o755 });
      const { command, args, env } = sandboxSpawn({ workspaceDir: nestedWorkspace }, scriptPath, []);
      try {
        execFileSync(command, args, { cwd: nestedWorkspace, env: env as NodeJS.ProcessEnv, stdio: 'pipe' });
        return true;
      } catch {
        return false;
      }
    };

    expect(run(`cat "${repoRoot}/package.json"`)).toBe(true);
    expect(run(`cat "${grandparent}/package.json"`)).toBe(true);
    expect(run(`cat "${grandparent}/secrets.txt"`)).toBe(false);
    rmSync(grandparent, { recursive: true, force: true });
  });

  it('a non-secret $HOME read outside any carve-in reports EPERM, not ENOENT', () => {
    // Directory-listing-based resolvers (esbuild, notably) walk ancestor directories under $HOME
    // while resolving an entry point; those directories genuinely exist (metadata is allowed
    // throughout $HOME), so denying their content read as ENOENT would falsely claim the directory
    // doesn't exist and break that resolution (this regressed real `npm test` runs inside a
    // workspace — see git history — before being reverted). EPERM carries no such false signal.
    const outside = mkdtempSync(path.join(homedir(), '.janissary-sandbox-test-'));
    writeFileSync(path.join(outside, 'ordinary.txt'), 'deny me, but say so honestly');
    const scriptPath = path.join(workspaceDir, 'run.sh');
    writeFileSync(scriptPath, `#!/bin/sh\ncat "${path.join(outside, 'ordinary.txt')}"\n`, { mode: 0o755 });
    const { command, args, env } = sandboxSpawn({ workspaceDir }, scriptPath, []);
    try {
      execFileSync(command, args, { cwd: workspaceDir, env: env as NodeJS.ProcessEnv, stdio: 'pipe' });
      expect.unreachable('expected the read to be denied');
    } catch (error) {
      const stderr = (error as { stderr?: Buffer }).stderr?.toString() ?? '';
      expect(stderr).toContain('Operation not permitted');
      expect(stderr).not.toContain('No such file or directory');
    }
    rmSync(outside, { recursive: true, force: true });
  });

  it('a denied secret path reports ENOENT, not EPERM', () => {
    // Unlike the general $HOME deny above, secret paths are individual files a resolver never
    // treats as a required ancestor of anything else, so there's no directory-existence lie in
    // play here — ENOENT is safe, and better secrecy (EPERM already confirms the path exists).
    // .terraform.d is a real SECRET_DENY_PATHS entry; confirmed absent on the test machine so this
    // is safe to create and remove without touching anything real.
    const secretDir = path.join(homedir(), '.terraform.d');
    expect(existsSync(secretDir)).toBe(false);
    mkdirSync(secretDir);
    writeFileSync(path.join(secretDir, 'credentials.tfrc.json'), '{"token":"deny me"}');
    const scriptPath = path.join(workspaceDir, 'run.sh');
    writeFileSync(scriptPath, `#!/bin/sh\ncat "${path.join(secretDir, 'credentials.tfrc.json')}"\n`, { mode: 0o755 });
    const { command, args, env } = sandboxSpawn({ workspaceDir }, scriptPath, []);
    try {
      execFileSync(command, args, { cwd: workspaceDir, env: env as NodeJS.ProcessEnv, stdio: 'pipe' });
      expect.unreachable('expected the read to be denied');
    } catch (error) {
      const stderr = (error as { stderr?: Buffer }).stderr?.toString() ?? '';
      expect(stderr).toContain('No such file or directory');
      expect(stderr).not.toContain('Operation not permitted');
    } finally {
      rmSync(secretDir, { recursive: true, force: true });
    }
  });

  it('lists ~/.claude (opendir) but still denies reading a non-carved-in file inside it', () => {
    // .claude/settings.json is carved into HOME_READ_CARVEINS, but opening a *directory* node for
    // listing is a separate Seatbelt operation from opening a file at a known path — this proves
    // both: `.claude` itself is listable (HOME_READ_LISTING_DIRS), and that doesn't widen into
    // reading arbitrary files inside it that aren't otherwise carved in.
    const claudeDir = path.join(homedir(), '.claude');
    const uncarvedFile = path.join(claudeDir, `sandbox-test-uncarved-${Date.now()}.txt`);
    writeFileSync(uncarvedFile, 'not carved in, should stay denied');
    const scriptPath = path.join(workspaceDir, 'run.sh');
    writeFileSync(
      scriptPath,
      `#!/bin/sh\nls "${claudeDir}" >/dev/null && cat "${path.join(claudeDir, 'settings.json')}" >/dev/null && cat "${uncarvedFile}"\n`,
      { mode: 0o755 },
    );
    const { command, args, env } = sandboxSpawn({ workspaceDir }, scriptPath, []);
    try {
      execFileSync(command, args, { cwd: workspaceDir, env: env as NodeJS.ProcessEnv, stdio: 'pipe' });
      expect.unreachable('expected the uncarved file read to be denied');
    } catch (error) {
      const stderr = (error as { stderr?: Buffer }).stderr?.toString() ?? '';
      expect(stderr).toContain('Operation not permitted');
    } finally {
      rmSync(uncarvedFile, { force: true });
    }
  });

  it('denies exec of a script copied to /tmp', () => {
    const tmpScript = path.join('/tmp', `sandbox-exec-test-${Date.now()}.sh`);
    writeFileSync(tmpScript, '#!/bin/sh\necho ran\n', { mode: 0o755 });
    const { command, args } = sandboxSpawn({ workspaceDir }, tmpScript, []);
    expect(() => execFileSync(command, args, { cwd: workspaceDir, stdio: 'pipe' })).toThrow();
    rmSync(tmpScript, { force: true });
  });
});
