import { githubRepository } from './git/repository-url.js';

// Builds a GitHub commits-page URL for `remote`/`branch` (e.g.
// https://github.com/owner/repo/commits/main/), or undefined when `remote` isn't a github.com
// origin — a non-GitHub host, or a URL `toHttpsUrl` couldn't normalize.
export function githubCommitsUrl(remote: string, branch: string): string | undefined {
  const repository = githubRepository(remote);
  if (!repository) return undefined;
  return `https://github.com/${repository.owner}/${repository.repo}/commits/${branch}/`;
}
