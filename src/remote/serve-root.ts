import { existsSync } from 'node:fs';
import path from 'node:path';
import { findRepoRoot, getRemoteUrl } from '../workspace/index.js';
import { expandUserPath } from '../paths.js';

// `janus remote-serve`'s startup checks, kept apart from the frame loop because they are the only
// part of the remote server that can fail before a channel exists. Each failure reaches the local
// side as a workspace-failed frame and a non-zero exit, which lands in the placeholder tab's
// `provisionError` exactly as a failed local clone does.

export type RemoteRootResult = { root: string } | { error: string };

/**
 * The remote's project root. With a path argument the server is rooted exactly there — no upward
 * walk, so `on host:/tmp` fails with "not a git repository" rather than silently serving `/`. With
 * no argument it walks up from the ssh login directory, the same walk `findRepoRoot` already does
 * locally. Either way the root must be a git repository with an `origin` remote, since provisioning
 * a workspace clone from it is the only thing this server does.
 */
export function resolveRemoteRoot(argument: string | undefined): RemoteRootResult {
  if (argument === undefined) {
    const found = findRepoRoot(process.cwd());
    if (found === undefined) return { error: `No git repository found at or above ${process.cwd()}.` };
    return withOrigin(found);
  }
  const resolved = path.resolve(expandUserPath(argument, { root: process.cwd() }));
  if (!existsSync(resolved)) return { error: `Remote path not found: ${resolved}` };
  if (!existsSync(path.join(resolved, '.git'))) return { error: `${resolved} is not a git repository.` };
  return withOrigin(resolved);
}

function withOrigin(root: string): RemoteRootResult {
  try {
    getRemoteUrl(root);
  } catch {
    return { error: `${root} has no "origin" remote.` };
  }
  return { root };
}
