#!/usr/bin/env node
// Detect changed files in the working tree (uncommitted + untracked), optionally adding the
// files a branch committed since a base ref. Used by lint-files, check-diff, and other dev tools.

import { execFileSync } from 'node:child_process';

const fromGit = (commandArguments) =>
  execFileSync('git', commandArguments, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).split('\n').filter(Boolean);

function uncommittedFiles() {
  try {
    // No explicit paths: everything not yet committed. `git diff HEAD` covers both
    // staged and unstaged changes; `--diff-filter=d` drops deletions (can't lint a gone
    // file); `ls-files --others --exclude-standard` adds new, non-ignored files.
    const changed = fromGit(['diff', '--name-only', '--diff-filter=d', 'HEAD']);
    const untracked = fromGit(['ls-files', '--others', '--exclude-standard']);
    return [...changed, ...untracked];
  } catch {
    // No git or no HEAD (fresh clone, initial commit): treat as no changes.
    return [];
  }
}

// With a base ref, the branch's committed changes since it are added. A ref git cannot resolve
// throws rather than reading as "no changes", so a bad base can never pass a gate unchecked.
// eslint-disable-next-line unicorn/no-exports-in-scripts
export function changedFiles(base) {
  const committed = base === undefined ? [] : fromGit(['diff', '--name-only', '--diff-filter=d', `${base}...HEAD`]);
  return [...new Set([...committed, ...uncommittedFiles()])];
}
