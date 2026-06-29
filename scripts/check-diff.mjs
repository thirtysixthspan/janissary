#!/usr/bin/env node
// Fast diff-scoped checks: lint changed files, typecheck affected projects (incremental),
// run related tests. Runs concurrently and reports a summary.
//
//   npm run check:diff           # concurrent lint + tsc + test
//   npm run check:diff -- --seq  # sequential (fail-fast) for debugging

import { execFileSync } from 'node:child_process';
import { changedFiles } from './changed-files.mjs';

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

// Tools to run with timing
const tools = [];

if (hasLintable) {
  tools.push({
    name: 'lint',
    run: () => execFileSync('node', ['scripts/lint-files.mjs'], { stdio: 'pipe', encoding: 'utf8' }),
  });
}

if (touchesSrc || touchesWeb) {
  tools.push({
    name: 'tsc',
    run: () => execFileSync('npm', ['run', 'typecheck:diff'], { stdio: 'pipe', encoding: 'utf8' }),
  });
}

if (touchesSrc) {
  tools.push({
    name: 'test:server',
    run: () => execFileSync('npm', ['run', 'test:diff:server'], { stdio: 'pipe', encoding: 'utf8' }),
  });
}

if (touchesWeb) {
  tools.push({
    name: 'test:web',
    run: () => execFileSync('npm', ['run', 'test:diff:web'], { stdio: 'pipe', encoding: 'utf8' }),
  });
}

// Run tools concurrently or sequentially
const results = [];
const startTime = Date.now();

if (seq) {
  for (const tool of tools) {
    const start = Date.now();
    let status = 'pass';
    try {
      tool.run();
    } catch {
      status = 'fail';
    }
    results.push({ ...tool, status, time: Date.now() - start });
  }
} else {
  const promises = tools.map(
    (tool) =>
      new Promise((resolve) => {
        const start = Date.now();
        let status = 'pass';
        try {
          tool.run();
        } catch {
          status = 'fail';
        }
        resolve({ ...tool, status, time: Date.now() - start });
      }),
  );
  results.push(...(await Promise.all(promises)));
}

// Print summary
const summary = results
  .map((r) => `${r.name} ${r.status === 'pass' ? '✓' : '✗'} (${r.time}ms)`)
  .join('  ');
console.log(`\n${summary}`);
console.log(`total: ${Date.now() - startTime}ms`);

// Exit non-zero if any failed
const anyFailed = results.some((r) => r.status === 'fail');
process.exit(anyFailed ? 1 : 0);
