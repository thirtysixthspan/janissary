#!/usr/bin/env node
// Detect changed files in the working tree (uncommitted + untracked).
// Used by lint-files, check-diff, and other dev tools.

import { execFileSync } from 'node:child_process';

// eslint-disable-next-line unicorn/no-exports-in-scripts
export function changedFiles() {
  try {
    // No explicit paths: everything not yet committed. `git diff HEAD` covers both
    // staged and unstaged changes; `--diff-filter=d` drops deletions (can't lint a gone
    // file); `ls-files --others --exclude-standard` adds new, non-ignored files.
    const fromGit = (command, commandArguments) =>
      execFileSync(command, commandArguments, { encoding: 'utf8' }).split('\n').filter(Boolean);
    const changed = fromGit('git', ['diff', '--name-only', '--diff-filter=d', 'HEAD']);
    const untracked = fromGit('git', ['ls-files', '--others', '--exclude-standard']);
    return [...new Set([...changed, ...untracked])];
  } catch {
    // No git or no HEAD (fresh clone, initial commit): treat as no changes.
    return [];
  }
}
