#!/usr/bin/env node
// Publish a prepared release to npm and GitHub. Expects the tag to already exist
// locally (created by scripts/release.mjs). Does not build or test — run
// scripts/release.mjs first.
//
// Usage:
//   node scripts/publish.mjs              # dry-run
//   node scripts/publish.mjs --for-real   # actually publish

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const tag = `v${version}`;
const dryRun = !process.argv.includes('--for-real');

function run(cmd, cmdArgs) {
  execFileSync(cmd, cmdArgs, { stdio: 'inherit' });
}

function capture(cmd, cmdArgs) {
  return execFileSync(cmd, cmdArgs, { encoding: 'utf8' }).trimEnd();
}

function checkTagExists() {
  try {
    capture('git', ['rev-parse', '--verify', '--quiet', tag]);
  } catch {
    console.error(`fatal: tag ${tag} does not exist. Run scripts/release.mjs first.`);
    process.exit(1);
  }
}

async function confirm() {
  if (dryRun) return;
  const rl = createInterface({ input, output });
  const answer = await rl.question(`Publish ${tag} to npm, push, and create GitHub Release? (y/N) `);
  rl.close();
  if (!answer.toLowerCase().startsWith('y')) {
    console.log('Aborted.');
    process.exit(0);
  }
}

checkTagExists();
await confirm();

if (dryRun) {
  console.log(`DRY-RUN: would publish ${tag} to npm, push, and create GitHub Release.`);
  console.log('Run with --for-real to execute.');
  process.exit(0);
}

run('npm', ['publish']);
run('git', ['push', '--follow-tags']);
run('gh', ['release', 'create', tag, '--generate-notes', '--title', tag]);

console.log(`\nPublished ${tag}`);
