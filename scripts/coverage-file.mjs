#!/usr/bin/env node
// Print per-file coverage detail from coverage/coverage-final.json for one file, without
// building a one-off `node -e` snippet each time. Used by ai/tasks/improve-test-coverage.md's Step 6
// to precisely confirm a target file's coverage moved, since the printed summary table rounds
// percentages and truncates long paths.
//
// Usage: ./scripts/run.mjs coverage-file <path-substring>
// Requires `npm run coverage` to have already run (reads coverage/coverage-final.json).

import { readFileSync } from 'node:fs';
import path from 'node:path';

const substring = process.argv[2];
if (!substring) {
  console.error('Usage: coverage-file <path-substring>');
  process.exit(1);
}

const coveragePath = path.resolve('coverage', 'coverage-final.json');
let data;
try {
  data = JSON.parse(readFileSync(coveragePath, 'utf8'));
} catch {
  console.error(`Could not read ${coveragePath} — run "npm run coverage" first.`);
  process.exit(1);
}

const matches = Object.keys(data).filter((key) => key.includes(substring));
if (matches.length === 0) {
  console.error(`No file in coverage-final.json matches "${substring}".`);
  process.exit(1);
}
if (matches.length > 1) {
  console.error(`"${substring}" matches multiple files — be more specific:\n${matches.map((m) => `  ${m}`).join('\n')}`);
  process.exit(1);
}

const file = data[matches[0]];

function summarize(map, hits) {
  const total = Object.keys(map).length;
  const covered = Object.values(hits).filter((count) => count > 0).length;
  const pct = total === 0 ? 100 : Math.round((covered / total) * 1000) / 10;
  return { total, covered, pct };
}

// Branches are arrays of hit counts (one per location); a branch entry is "covered" only when
// every location in it was hit at least once, matching Istanbul's own branch-coverage definition.
function summarizeBranches(branchMap, b) {
  const entries = Object.entries(branchMap);
  const total = entries.reduce((sum, [, entry]) => sum + entry.locations.length, 0);
  const covered = Object.values(b).reduce((sum, hits) => sum + hits.filter((count) => count > 0).length, 0);
  const pct = total === 0 ? 100 : Math.round((covered / total) * 1000) / 10;
  return { total, covered, pct };
}

// "% Lines" (matching the printed coverage table's column, and lcov's LF/LH) is not raw statement
// count — Istanbul derives it by collapsing statements onto their start line, keeping the highest
// hit count per line (istanbul-lib-coverage's FileCoverage#getLineCoverage). Two statements on the
// same line count as one line; a statement spanning multiple lines only counts on its start line.
function lineCoverage(statementMap, s) {
  const lineMap = new Map();
  for (const [id, entry] of Object.entries(statementMap)) {
    const line = entry.start.line;
    const count = s[id];
    if (!lineMap.has(line) || lineMap.get(line) < count) lineMap.set(line, count);
  }
  const total = lineMap.size;
  const covered = [...lineMap.values()].filter((count) => count > 0).length;
  const pct = total === 0 ? 100 : Math.round((covered / total) * 1000) / 10;
  const uncovered = [...lineMap].filter(([, count]) => count === 0).map(([line]) => line).toSorted((a, b) => a - b);
  return { total, covered, pct, uncovered };
}

const statements = summarize(file.statementMap, file.s);
const branches = summarizeBranches(file.branchMap, file.b);
const functions = summarize(file.fnMap, file.f);
const lines = lineCoverage(file.statementMap, file.s);

console.log(matches[0]);
console.log(`Statements: ${statements.covered}/${statements.total} (${statements.pct}%)`);
console.log(`Branches:   ${branches.covered}/${branches.total} (${branches.pct}%)`);
console.log(`Functions:  ${functions.covered}/${functions.total} (${functions.pct}%)`);
console.log(`Lines:      ${lines.covered}/${lines.total} (${lines.pct}%)`);
console.log(`Uncovered line #s: ${lines.uncovered.length > 0 ? lines.uncovered.join(', ') : 'none'}`);
