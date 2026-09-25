import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { findRepoRoot, getRemoteUrl } from '../workspace/index.js';
import { expandUserPath } from '../paths.js';
import { isGitHubUrl, repositoryName, sameRepository, toHttpsUrl } from '../git/repository-url.js';
import type { RootRefusal } from './root-refusal.js';

// Where `janus remote-serve` is rooted, settled on the first `provision` or `attach` rather than at
// startup, so a root that cannot be used reaches the local side as a structured answer instead of a
// process that dies before its handshake. This module only classifies; nothing here clones, locks,
// or asks (see `serve-root-offer.ts`).

// A clone that may be made: `url` into `target`. `home` is present when the target is the remote
// user's `<home>/<repo-name>`, which the prompt names differently from an explicit missing path.
export type RootOffer = { target: string; url: string; home?: string };

export type RootOutcome = { root: string } | { offer: RootOffer } | { refusal: RootRefusal };

export type RootOptions = {
  // Whether a GitHub credential was forwarded: it decides which URL an offer would clone, and that
  // is the only thing it is used for here.
  githubToken?: boolean;
  home?: string;
  cwd?: string;
};

type Classifier = { origin: string; url: string; home: string };

function originOf(directory: string): string | undefined {
  try {
    return getRemoteUrl(directory);
  } catch {
    return undefined;
  }
}

// The URL a clone of `origin` actually fetches: its HTTPS form when the forwarded GitHub token
// applies to it, otherwise the origin as it is.
export function cloneUrl(origin: string, githubToken: boolean | undefined): string {
  return githubToken === true && isGitHubUrl(origin) ? toHttpsUrl(origin) : origin;
}

function isEmptyDirectory(directory: string): boolean {
  return statSync(directory).isDirectory() && readdirSync(directory).length === 0;
}

// A repository at `directory` used as the root: it must have an `origin`, and with one to compare
// against, that `origin` must name the same repository.
function repositoryRoot(directory: string, origin: string | undefined): RootOutcome {
  const other = originOf(directory);
  if (other === undefined) return { refusal: { kind: 'no-origin', path: directory } };
  if (origin !== undefined && !sameRepository(other, origin)) {
    return { refusal: { kind: 'different-origin', path: directory, other, url: origin } };
  }
  return { root: directory };
}

// The home-directory target: `<home>/<repo-name>` is used when it already holds a clone of this
// project, offered when it is missing or empty, and refused when anything else is there.
function homeTarget({ origin, url, home }: Classifier): RootOutcome {
  const name = repositoryName(origin);
  if (name === undefined) return { refusal: { kind: 'no-repo-name', path: home, url } };
  const target = path.join(home, name);
  if (!existsSync(target) || isEmptyDirectory(target)) return { offer: { target, url, home } };
  if (existsSync(path.join(target, '.git'))) {
    const other = originOf(target);
    if (other !== undefined && sameRepository(other, origin)) return { root: target };
  }
  return { refusal: { kind: 'occupied', path: target } };
}

// No path in the address: walk up from the ssh login directory. Finding no clone of this project —
// no repository at all, or one with another `origin` — falls through to the home-directory target.
function walkUp(cwd: string, classifier: Classifier | undefined): RootOutcome {
  const found = findRepoRoot(cwd);
  if (found === undefined) {
    return classifier ? homeTarget(classifier) : { refusal: { kind: 'no-repository-found', path: cwd } };
  }
  const outcome = repositoryRoot(found, classifier?.origin);
  if (classifier && 'refusal' in outcome && outcome.refusal.kind === 'different-origin') return homeTarget(classifier);
  return outcome;
}

/**
 * The remote's project root for a launch. With a path argument the server is rooted exactly there —
 * no upward walk, so `on host:/tmp` is refused as "not a git repository" rather than silently serving
 * `/`. With no argument it walks up from the ssh login directory, the same walk `findRepoRoot`
 * already does locally. Either way the root must be a git repository with an `origin` remote.
 *
 * With `origin` (a `provision` from a project that has one), that remote must also be a clone of
 * this project, and a missing clone is offered rather than refused: at an explicit path that does
 * not exist, or under the home directory when no path was given or the path is the home directory.
 * Without it (an `attach`, or a project with no origin) every outcome is today's: a root or a
 * refusal, never an offer.
 */
export function resolveRemoteRoot(argument: string | undefined, origin?: string, options: RootOptions = {}): RootOutcome {
  const cwd = options.cwd ?? process.cwd();
  const home = options.home ?? homedir();
  const classifier = origin === undefined ? undefined : { origin, url: cloneUrl(origin, options.githubToken), home };
  if (argument === undefined) return walkUp(cwd, classifier);
  const resolved = path.resolve(cwd, expandUserPath(argument, { root: cwd, home }));
  if (!existsSync(resolved)) {
    return classifier ? { offer: { target: resolved, url: classifier.url } } : { refusal: { kind: 'not-found', path: resolved } };
  }
  if (!existsSync(path.join(resolved, '.git'))) {
    if (classifier && resolved === path.resolve(home)) return homeTarget(classifier);
    return { refusal: { kind: 'not-repository', path: resolved } };
  }
  return repositoryRoot(resolved, origin);
}
