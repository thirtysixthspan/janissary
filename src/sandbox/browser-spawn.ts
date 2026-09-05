import { homedir } from 'node:os';
import path from 'node:path';
import { BROWSER_SANDBOX_PROFILE, browserProfileParams } from './browser-profile.js';
import { BROWSER_ENV_ALLOW } from './paths.js';
import { resolvePath, dualPath, darwinUserCacheDir } from './resolve.js';

// How the e2e browser child is spawned, on both kinds of host. Split out of `index.ts` because it
// answers every question differently from the harness spawn beside it: a different profile, a
// different parameter list, and an environment chosen by allowlist rather than by scrub.

export type BrowserSpawnOptions = {
  chromiumDir: string;
  // Janissary's installation root. Never carved in whole — in a development install it *is* the
  // project directory, so the profile takes its runtime pieces from here and denies `.janissary`
  // inside them.
  appDir: string;
  // The code tree actually running: `src/` under tsx, `dist/` under a build.
  appEntryDir: string;
  // Named explicitly because a hoisted layout puts them beside the installation rather than inside
  // its own `node_modules`.
  playwrightDirs: string[];
};

export type BrowserSpawnResult = { command: string; args: string[]; env: NodeJS.ProcessEnv };

// The browser child's environment, built by naming what it may have rather than by filtering what
// the server happens to hold (see `BROWSER_ENV_ALLOW`). Neither environment the harness path builds
// is right for it: one hands a workspaced spawn the project's tokens, and the other deliberately
// keeps the LLM provider keys a harness needs. A browser authenticates to nothing and pushes
// nowhere, so it gets neither.
function browserEnv(env: NodeJS.ProcessEnv, tmpDir: string | undefined): NodeJS.ProcessEnv {
  const allowed: NodeJS.ProcessEnv = {};
  for (const name of BROWSER_ENV_ALLOW) {
    const value = env[name];
    if (value !== undefined) allowed[name] = value;
  }
  if (tmpDir) allowed.TMPDIR = tmpDir;
  return allowed;
}

/**
 * Wrap the browser child's spawn. Its environment is the same on every host — the allowlist, with no
 * project credentials and no git identity — and only the command differs: wrapped in the minimal
 * browser profile where Seatbelt is available, handed back bare where it is not. That asymmetry is
 * the documented one, and it is about confinement alone; an unconfined browser is not a reason to
 * also give it the server's secrets.
 */
export function browserSpawn(
  browser: BrowserSpawnOptions,
  workspaceDir: string | undefined,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  confinable: boolean,
): BrowserSpawnResult {
  const tmpDir = workspaceDir ? resolvePath(`${workspaceDir}.tmp`) : undefined;
  const childEnv = browserEnv(env, tmpDir);
  if (!workspaceDir || !confinable) return { command, args, env: childEnv };
  const params = browserProfileParams({
    workspace: resolvePath(workspaceDir), tmp: tmpDir ?? '', home: resolvePath(homedir()),
    cache: darwinUserCacheDir(),
    chromium: dualPath(browser.chromiumDir),
    node: dualPath(path.dirname(process.execPath)),
    appModules: dualPath(path.join(browser.appDir, 'node_modules')),
    appEntry: dualPath(browser.appEntryDir),
    playwright: dualPath(browser.playwrightDirs[0] ?? browser.appDir),
    playwrightCore: dualPath(browser.playwrightDirs[1] ?? browser.playwrightDirs[0] ?? browser.appDir),
    appManifest: dualPath(path.join(browser.appDir, 'package.json')),
    appTsconfig: dualPath(path.join(browser.appDir, 'tsconfig.json')),
    appState: dualPath(path.join(browser.appDir, '.janissary')),
  });
  return {
    command: 'sandbox-exec',
    args: ['-p', BROWSER_SANDBOX_PROFILE, ...params, '--', command, ...args],
    env: childEnv,
  };
}
