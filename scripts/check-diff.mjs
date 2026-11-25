#!/usr/bin/env node
// Fast diff-scoped checks: lint changed files, typecheck affected projects (incremental),
// run related tests. Checks run concurrently by default and a failing check prints its buffered
// output. `--seq` runs them one at a time and stops at the first failure.
//
//   npm run check:diff           # concurrent lint + tsc + test
//   npm run check:diff -- --seq  # sequential (fail-fast) for debugging

import { spawn } from 'node:child_process';
import { changedFiles } from './changed-files.mjs';
import { hasHelpMarkdownChanges } from './help-doc-changes.mjs';
import { scriptPath } from './script-path.mjs';

// Named from this file's own directory, not the working directory — see `script-path.mjs`.
const LINT_FILES = scriptPath('lint-files.mjs');

const LINTABLE = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;
const seq = process.argv.includes('--seq');

const files = changedFiles();
if (files.length === 0) {
  console.log('check:diff: no changes');
  process.exit(0);
}

// Classify files to decide which checks to run
const hasLintable = files.some((f) => {
  const base = f.split('/').pop() ?? f;
  return !base.includes('.') || LINTABLE.test(f);
});
const touchesSrc = files.some((f) => f.startsWith('src/'));
const touchesWeb = files.some((f) => f.startsWith('web/'));
const touchesHelp = hasHelpMarkdownChanges(files);
// The server project also carries the tests for scripts/ (see vitest.config.ts), which have no
// TypeScript project of their own to typecheck.
const touchesScripts = files.some((f) => f.startsWith('scripts/'));

function makeCheck(name, executable, args, display) {
  return { name, executable, args, display: display ?? [executable, ...args].join(' ') };
}

// Checks to run with timing. `display` is the command a user would type to rerun a check by hand.
const checks = [];

if (hasLintable) {
  checks.push(makeCheck('lint', 'node', [LINT_FILES], '$janissary/scripts/run.mjs lint-files'));
}

if (touchesSrc || touchesWeb) {
  checks.push(makeCheck('tsc', 'npm', ['run', 'typecheck:diff']));
}

if (touchesSrc || touchesScripts) {
  checks.push(makeCheck('test:server', 'npm', ['run', 'test:diff:server']));
}

if (touchesWeb) {
  checks.push(makeCheck('test:web', 'npm', ['run', 'test:diff:web']));
}

if (touchesHelp) {
  checks.push(makeCheck('test:help', 'npm', ['run', 'test:server', '--', 'src/commands.test.ts']));
}

if (checks.length === 0) {
  console.log('check:diff: no checks apply to the changed files');
  process.exit(0);
}

function outputLines(output) {
  if (output.trim() === '') return [];
  const withoutTrailingNewline = output.endsWith('\n') ? output.slice(0, -1) : output;
  return withoutTrailingNewline.split('\n');
}

function printFailure(result) {
  console.log(`--- ${result.name} ✗ ${result.cause}: ${result.display} ---`);
  const lines = outputLines(result.output);
  if (lines.length === 0) {
    console.log('(no output)');
    return;
  }
  const omitted = Math.max(0, lines.length - 200);
  if (omitted > 0) console.log(`(… ${omitted} earlier lines omitted)`);
  console.log(lines.slice(-200).join('\n'));
}

function runCheck(check, start) {
  return new Promise((resolve) => {
    const child = spawn(check.executable, check.args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let settled = false;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });

    const settle = (outcome) => {
      // A failed spawn also emits `close`; ignore it so a check that could not start is always
      // reported as such and its failure block is printed only once.
      if (settled) return;
      settled = true;
      const result = { ...check, ...outcome, output, time: Date.now() - start };
      if (result.status === 'fail') printFailure(result);
      resolve(result);
    };

    child.on('error', (error) => {
      settle({ status: 'fail', cause: `could not start (${error.message})` });
    });
    child.on('close', (code, signal) => {
      if (code === 0) {
        settle({ status: 'pass', cause: null });
      } else if (signal === null) {
        settle({ status: 'fail', cause: `exit ${code}` });
      } else {
        settle({ status: 'fail', cause: `exit ${signal}` });
      }
    });
  });
}

function summaryLine(result) {
  if (result.status === 'skipped') return `${result.name} - skipped`;
  if (result.status === 'pass') return `${result.name} ✓ (${result.time}ms)`;
  return `${result.name} ✗ (${result.time}ms) ${result.cause}: ${result.display}`;
}

console.log(`check:diff: running ${checks.map((check) => check.name).join(', ')}`);
const startTime = Date.now();

let results;
if (seq) {
  results = [];
  let failed = false;
  for (const check of checks) {
    if (failed) {
      results.push({ ...check, status: 'skipped', cause: null, output: '', time: 0 });
      continue;
    }
    const result = await runCheck(check, Date.now());
    results.push(result);
    if (result.status === 'fail') failed = true;
  }
} else {
  results = await Promise.all(
    checks.map((check) => runCheck(check, Date.now())),
  );
}

console.log('');
for (const result of results) console.log(summaryLine(result));
console.log(`total: ${Date.now() - startTime}ms`);
process.exitCode = results.some((result) => result.status === 'fail') ? 1 : 0;
