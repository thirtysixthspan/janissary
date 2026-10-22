import type { GitCloneOptions } from '../git/clone.js';

// How much history a local workspace clone fetches. A shell works on the code as it stands, so it
// takes only the newest commit; a harness gets ten, enough to read what changed recently. Both keep
// every branch, and `git fetch --unshallow` inside the clone fetches the rest of the history.
export const SHELL_WORKSPACE_CLONE: Omit<GitCloneOptions, 'githubToken'> = { depth: 1, allBranches: true };
export const HARNESS_WORKSPACE_CLONE: Omit<GitCloneOptions, 'githubToken'> = { depth: 10, allBranches: true };
