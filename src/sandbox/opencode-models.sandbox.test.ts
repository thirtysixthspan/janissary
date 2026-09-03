import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { sandboxAvailable, sandboxSpawn } from './index.js';

// Exercises the real `sandbox-exec` profile against opencode's cached model catalog
// (`~/.cache/opencode/models.json`), the read carve-in that lets a workspaced opencode harness see
// the model list the non-sandboxed opencode has already fetched. The real cache must never be read
// or written here, so — exactly as `keychain.sandbox.test.ts` does — these tests take the shipped
// profile + `-D` params from `sandboxSpawn` and relocate every occurrence of the real home path to
// a throwaway temp dir, then point the sandboxed process's `HOME` at it. The carve-in is
// home-relative, so this faithfully exercises it.
describe.skipIf(!sandboxAvailable())('sandbox opencode model-cache read carve-in', () => {
  let workspaceDir: string;
  let fakeHome: string;
  let cacheDir: string;
  let modelsJson: string;
  let baseArgs: string[];
  let env: NodeJS.ProcessEnv;

  beforeEach(() => {
    loadConfig(mkdtempSync(path.join(tmpdir(), 'oc-cfg-')));
    workspaceDir = mkdtempSync(path.join(tmpdir(), 'oc-ws-'));
    mkdirSync(`${workspaceDir}.tmp`, { recursive: true });
    fakeHome = realpathSync(mkdtempSync(path.join(tmpdir(), 'oc-home-')));
    cacheDir = path.join(fakeHome, '.cache', 'opencode');
    modelsJson = path.join(cacheDir, 'models.json');
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(modelsJson, '{"models":["claude-opus-5"]}');

    const realHome = realpathSync(homedir());
    const spawn = sandboxSpawn({ workspaceDir }, '/bin/sh', []);
    baseArgs = spawn.args.slice(0, spawn.args.indexOf('--')).map((a) => a.split(realHome).join(fakeHome));
    env = { ...spawn.env, HOME: fakeHome } as NodeJS.ProcessEnv;
  });

  afterEach(() => {
    rmSync(workspaceDir, { recursive: true, force: true });
    rmSync(`${workspaceDir}.tmp`, { recursive: true, force: true });
    rmSync(fakeHome, { recursive: true, force: true });
  });

  // Whether the sandboxed process can run `script`. A `sandbox_apply` failure is re-thrown rather
  // than reported as a denial: it means the profile never took effect at all (sandbox-exec cannot
  // nest inside an already-sandboxed process, so this is what happens when the suite is run from
  // inside a workspace instead of on the host). Collapsing that into `false` would make every
  // deny-expecting assertion below pass while proving nothing.
  const run = (script: string): boolean => {
    try {
      execFileSync('sandbox-exec', [...baseArgs, '--', '/bin/sh', '-c', script],
        { cwd: workspaceDir, env, stdio: 'pipe' });
      return true;
    } catch (error) {
      const stderr = (error as { stderr?: Buffer }).stderr?.toString() ?? '';
      if (stderr.includes('sandbox_apply')) {
        throw new Error(
          `sandbox profile did not apply (run this on the host, not inside a workspace): ${stderr.trim()}`,
          { cause: error },
        );
      }
      return false;
    }
  };

  it('allows reading the cached opencode model list', () => {
    // Regression: without the carve-in this read hits the $HOME content deny and fails EPERM, so a
    // workspaced opencode harness cannot see the models the host has already fetched.
    expect(run(`cat "${modelsJson}"`)).toBe(true);
  });

  it('keeps the carve-in narrow: other files under ~/.cache/opencode stay denied', () => {
    const sibling = path.join(cacheDir, 'other.json');
    writeFileSync(sibling, '{"unrelated":true}');
    expect(run(`cat "${sibling}"`)).toBe(false);
  });

  it('does not make the cached model list writable', () => {
    // Read-only by decision: a non-sandboxed opencode reads this same file, so a writable cache
    // would let a sandboxed agent feed it a forged catalog.
    expect(run(`printf x >> "${modelsJson}"`)).toBe(false);
  });
});
