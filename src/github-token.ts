import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

let githubToken: string | undefined;

// Reads `.janissary/github-token` — a user-provisioned, narrowly-scoped GitHub fine-grained PAT
// (Contents + Pull requests write, Metadata read) used to authenticate `git push`/`gh` from inside
// a sandboxed workspace. Absent by default: no token, no injection, workspaces behave as before.
export function loadGithubToken(projectDir: string): string | undefined {
  const tokenPath = path.join(projectDir, '.janissary', 'github-token');
  if (!existsSync(tokenPath)) {
    githubToken = undefined;
    return githubToken;
  }
  const token = readFileSync(tokenPath, 'utf8').trim();
  githubToken = token || undefined;
  return githubToken;
}

export function getGithubToken(): string | undefined {
  return githubToken;
}
