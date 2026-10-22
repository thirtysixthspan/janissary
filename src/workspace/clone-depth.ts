import type { GitCloneOptions } from '../git/clone.js';

// How much history a workspace clone fetches, on this machine or a remote host. A shell works on the
// code as it stands, so it takes only the newest commit; a harness gets ten, enough to read what
// changed recently, and an agent run gets the same as a harness. All keep every branch, and
// `git fetch --unshallow` inside the clone fetches the rest of the history.
export const SHELL_CLONE_DEPTH = 1;
export const HARNESS_CLONE_DEPTH = 10;
export const AGENT_CLONE_DEPTH = HARNESS_CLONE_DEPTH;

export function workspaceCloneOptions(depth: number): Omit<GitCloneOptions, 'githubToken'> {
  return { depth, allBranches: true };
}
