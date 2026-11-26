#!/usr/bin/env node
// Fast diff-scoped checks: lint changed files, typecheck affected projects (incremental),
// run related tests. Checks run concurrently by default and a failing check prints its buffered
// output. `--seq` runs them one at a time and stops at the first failure.
//
//   npm run check:diff           # concurrent lint + tsc + test
//   npm run check:diff -- --seq  # sequential (fail-fast) for debugging
//   npm run check:diff -- --base origin/master  # also the changes committed since that ref

import { spawn } from 'node:child_process';
import { parseBaseRef } from './base-ref.mjs';
import { changedFiles } from './changed-files.mjs';
import { selectChecks } from './diff-checks.mjs';

const { base, rest: options, error: baseError } = parseBaseRef(process.argv.slice(2));
if (baseError) {
  console.log(`check:diff: ${baseError}`);
  process.exit(1);
}
const seq = options.includes('--seq');

let files;
try {
  files = changedFiles(base);
} catch (error) {
  console.log(`check:diff: cannot diff against ${base}: ${error.message.trim()}`);
  process.exit(1);
}
if (files.length === 0) {
  console.log(base === undefined ? 'check:diff: no changes' : `check:diff: no changes against ${base}`);
  process.exit(0);
}

// Checks to run with timing.
const checks = selectChecks(files, base);

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
