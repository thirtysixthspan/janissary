import { toHttpsUrl } from './workspace.js';

// Builds a GitHub commits-page URL for `remote`/`branch` (e.g.
// https://github.com/owner/repo/commits/main/), or undefined when `remote` isn't a github.com
// origin — a non-GitHub host, or a URL `toHttpsUrl` couldn't normalize.
export function githubCommitsUrl(remote: string, branch: string): string | undefined {
  const https = toHttpsUrl(remote);
  const match = /^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(https);
  if (!match) return undefined;
  const [, owner, repo] = match;
  return `https://github.com/${owner}/${repo}/commits/${branch}/`;
}
