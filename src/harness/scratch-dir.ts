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
