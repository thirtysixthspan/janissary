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
import { existsSync } from 'node:fs';
import path from 'node:path';
import { changedFiles } from './changed-files.mjs';

const LINTABLE = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;

const arguments_ = process.argv.slice(2);
const flags = arguments_.filter((a) => a.startsWith('-'));
let paths = arguments_.filter((a) => !a.startsWith('-'));

if (paths.length === 0) {
  paths = changedFiles();
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

// Invoke the project's own ESLint via its bin shim, resolved from the working directory. This
// script is reached through `$janissary/scripts/run.mjs`, so its own directory is the Janissary
// installation; linting with the installation's ESLint would apply the wrong plugins and config to
// the project, and inside a sandboxed workspace the installation's `node_modules` is not readable.
const eslintBin = path.join(process.cwd(), 'node_modules', '.bin', 'eslint');
if (!existsSync(eslintBin)) {
  console.error(`lint-files: no ESLint at ${eslintBin}; run npm install in this project first.`);
  process.exit(1);
}
try {
  execFileSync(eslintBin, [...flags, '--cache', '--concurrency=auto', ...targets], { stdio: 'inherit' });
} catch (error) {
  process.exit(typeof error.status === 'number' ? error.status : 1);
}
