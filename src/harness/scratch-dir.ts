import { mkdirSync } from 'node:fs';
import path from 'node:path';

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
