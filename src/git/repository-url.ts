import { workspaceLabelError } from '../workspace/label.js';

// Pure helpers over a repository's `origin` URL, in any of the forms git accepts: scp
// (`git@host:owner/repo.git`), `ssh://`, and HTTPS. Nothing here touches git or the network.

// The schemes a parsed URL is trusted to carry a real host under. Anything else `URL` happily
// accepts — `myhost:repos/r.git` parses as scheme `myhost:` with no host at all — is treated as
// unparseable rather than compared on an empty host.
const HOSTED_PROTOCOLS = new Set(['http:', 'https:', 'ssh:', 'git:', 'file:']);

// Handles `git@github.com:owner/repo.git` and `ssh://git@github.com/owner/repo.git`; an
// already-HTTPS URL passes through unchanged.
export function toHttpsUrl(url: string): string {
  const scpMatch = /^git@([^:]+):(.+?)(\.git)?$/.exec(url);
  if (scpMatch) return `https://${scpMatch[1]}/${scpMatch[2]}.git`;
  const sshMatch = /^ssh:\/\/git@([^/]+)\/(.+?)(\.git)?$/.exec(url);
  if (sshMatch) return `https://${sshMatch[1]}/${sshMatch[2]}.git`;
  return url;
}

function parse(url: string): URL | undefined {
  try {
    const parsed = new URL(url);
    return HOSTED_PROTOCOLS.has(parsed.protocol) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

// The owner and repository of a github.com origin, or undefined for any other host or a URL
// `toHttpsUrl` could not normalize.
export function githubRepository(url: string): { owner: string; repo: string } | undefined {
  const match = /^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(toHttpsUrl(url));
  return match ? { owner: match[1], repo: match[2] } : undefined;
}

// Whether `url` names a repository on github.com — the one host a GitHub token may ever be sent to.
export function isGitHubUrl(url: string): boolean {
  return githubRepository(url) !== undefined;
}

function repositoryPath(pathname: string): string {
  return pathname.replace(/\/+$/, '').replace(/\.git$/, '');
}

/**
 * Whether two origins name the same repository over whatever transport each uses. Both are
 * normalized to HTTPS first, so the scp, `ssh://`, and HTTPS forms of one repository agree; `URL`
 * lowercases the host, and a trailing `.git` or slash is ignored. A URL that cannot be parsed —
 * a local path, say — matches only an identical string.
 */
export function sameRepository(a: string, b: string): boolean {
  if (a === b) return true;
  const left = parse(toHttpsUrl(a));
  const right = parse(toHttpsUrl(b));
  if (!left || !right) return false;
  return left.hostname === right.hostname && repositoryPath(left.pathname) === repositoryPath(right.pathname);
}

function lastSegment(url: string): string {
  const parsed = parse(toHttpsUrl(url));
  const pathname = parsed ? parsed.pathname : url.slice(url.lastIndexOf(':') + 1);
  const segment = pathname.replace(/\/+$/, '').split('/').at(-1) ?? '';
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

// The folder a clone of `url` is named by — its last path segment without `.git` — or undefined
// when there is none, or when it could not name a single folder.
export function repositoryName(url: string): string | undefined {
  const name = lastSegment(url).replace(/\.git$/, '');
  return workspaceLabelError(name) === undefined ? name : undefined;
}

/**
 * `url` with any embedded credential removed. An HTTP(S) origin loses both its username and its
 * password, since a token often sits in the username alone (`https://<token>@github.com/…`); an
 * `ssh://` origin keeps its username, which is the ssh login rather than a secret. The scp form
 * carries no password and passes through, as does anything else `URL` cannot parse.
 */
export function withoutCredentials(url: string): string {
  const parsed = parse(url);
  if (!parsed) return url;
  const before = parsed.toString();
  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') parsed.username = '';
  parsed.password = '';
  const after = parsed.toString();
  return after === before ? url : after;
}
