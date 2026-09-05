import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { startE2EBrowserServer, type E2EBrowserHandle } from '../browser/e2e-server.js';

// Experimental: the claude CLI's own scratch/cwd-tracking files default to /tmp. Pointing
// CLAUDE_CODE_TMPDIR at a project-local directory instead means a sandboxed harness tab doesn't
// need the /tmp carve-ins those files would otherwise require (see sandbox/profile.ts).
export function claudeTmpDir(cwd: string): string {
  const dir = path.join(cwd, '.janissary', 'temp');
  mkdirSync(dir, { recursive: true });
  return dir;
}

// The environment overrides a harness binary is spawned with, on the machine it runs on. It names
// paths that exist only there, so a remote launch builds its own copy of this on the far side
// rather than being handed one over the wire (see `src/remote/serve-processes.ts`).
export function harnessEnv(name: string, cwd: string): NodeJS.ProcessEnv | undefined {
  if (name !== 'claude') return undefined;
  return { CLAUDE_CODE_TMPDIR: claudeTmpDir(cwd), DISABLE_AUTOUPDATER: '1' };
}

export type HarnessSpawnEnv = {
  env: NodeJS.ProcessEnv | undefined;
  // Set only for a `-b` launch. The caller hands it to the tab's `HarnessRuntime`, which closes it
  // on the same disposal path the reader and recorder go through.
  handle?: E2EBrowserHandle;
  // Janissary-only spawn metadata. This never enters `env`, where the harness could read it.
  browserPort?: number;
};

/**
 * Everything a harness binary's spawn environment gains on the machine it runs on: `harnessEnv`
 * above, plus — for a `-b` launch — the e2e browser's two variables and the handle that owns it.
 * Both local and remote spawns call this, which is what makes the "a remote launch builds its own
 * copy on the far side" rule hold for the browser variables too.
 *
 * With no browser requested the result is exactly `harnessEnv`'s, `undefined` and all, so the
 * non-`-b` path is byte-for-byte what it was before this existed.
 */
export function harnessSpawnEnv(
  options: { name: string; cwd: string; label: string; browser: boolean; onBrowserGone: (message: string) => void },
): HarnessSpawnEnv {
  const base = harnessEnv(options.name, options.cwd);
  if (!options.browser) return { env: base };
  const browser = startE2EBrowserServer({ label: options.label, onGone: options.onBrowserGone });
  return { env: { ...base, ...browser.env }, handle: browser.handle, browserPort: browser.browserPort };
}
