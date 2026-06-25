#!/usr/bin/env node
// Lint a focused set of files instead of the whole tree (`eslint .`).
//
//   node scripts/lint-files.mjs                  # all uncommitted files (staged + unstaged + untracked)
//   node scripts/lint-files.mjs src/foo.ts ...   # only the files you name
//   node scripts/lint-files.mjs --fix            # autofix the uncommitted set
//   node scripts/lint-files.mjs --fix src/foo.ts # flags and files can be combined
//
// Arguments starting with `-` are forwarded to ESLint; everything else is treated as a
// path. With no paths given, the uncommitted set is derived from git. Only files ESLint
// can lint (.ts/.tsx/.js/.jsx/.mjs/.cjs) are passed on; anything else (.md, .json, dirs)
// is left to ESLint's own handling.
import { execFileSync } from 'node:child_process';

const LINTABLE = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;

const arguments_ = process.argv.slice(2);
const flags = arguments_.filter((a) => a.startsWith('-'));
let paths = arguments_.filter((a) => !a.startsWith('-'));

if (paths.length === 0) {
  // No explicit paths: lint everything not yet committed. `git diff HEAD` covers both
  // staged and unstaged changes; `--diff-filter=d` drops deletions (can't lint a gone
  // file); `ls-files --others --exclude-standard` adds new, non-ignored files.
  const fromGit = (command, commandArguments) =>
    execFileSync(command, commandArguments, { encoding: 'utf8' }).split('\n').filter(Boolean);
  const changed = fromGit('git', ['diff', '--name-only', '--diff-filter=d', 'HEAD']);
  const untracked = fromGit('git', ['ls-files', '--others', '--exclude-standard']);
  paths = [...new Set([...changed, ...untracked])];
}

// Keep paths ESLint can act on: lintable extensions, plus extension-less paths (likely
// directories) which ESLint resolves itself.
const targets = paths.filter((p) => {
  const base = p.split('/').pop() ?? p;
  return base.includes('.') ? LINTABLE.test(p) : true;
});

if (targets.length === 0) {
  console.error('lint-files: no lintable files to check.');
  process.exit(0);
}

console.error(`lint-files: linting ${targets.length} file(s)`);

// Invoke the locally installed ESLint via its bin shim, resolved relative to this script
// so it works regardless of the caller's working directory.
const eslintBin = new URL('../node_modules/.bin/eslint', import.meta.url).pathname;
try {
  execFileSync(eslintBin, [...flags, ...targets], { stdio: 'inherit' });
} catch (error) {
  process.exit(typeof error.status === 'number' ? error.status : 1);
}
