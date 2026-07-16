#!/usr/bin/env node
// Prepare a release: validate, pull, generate changelog, bump version, commit,
// tag, and run checks + build. Does not publish — run scripts/publish.mjs after.
//
// Usage:
//   node scripts/release.mjs            # print usage
//   node scripts/release.mjs patch      # dry-run: 0.5.0 -> 0.5.1
//   node scripts/release.mjs minor      # dry-run: 0.5.0 -> 0.6.0
//   node scripts/release.mjs major      # dry-run: 0.5.0 -> 1.0.0
//   node scripts/release.mjs 0.6.0      # dry-run: explicit version
//   node scripts/release.mjs patch --for-real

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { argv, stdin as input, stdout as output } from 'node:process';

const PKG = new URL('../package.json', import.meta.url);
const CHANGELOG = new URL('../CHANGELOG.md', import.meta.url);

const args = argv.slice(2);
const dryRun = !args.includes('--for-real');
const levelOrVersion = args.find((a) => !a.startsWith('-'));

function run(cmd, cmdArgs) {
  execFileSync(cmd, cmdArgs, { stdio: 'inherit' });
}

function capture(cmd, cmdArgs) {
  return execFileSync(cmd, cmdArgs, { encoding: 'utf8' }).trimEnd();
}

function checkCleanWorkingTree() {
  try {
    execFileSync('git', ['diff-index', '--quiet', 'HEAD'], { stdio: 'ignore' });
  } catch {
    console.error('fatal: working tree has uncommitted changes.');
    process.exit(1);
  }
}

function checkBranch() {
  const branch = capture('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch !== 'master' && branch !== 'main') {
    console.error(`fatal: releases must be cut from master/main (on ${branch}).`);
    process.exit(1);
  }
}

function computeVersion(current, input) {
  const levels = { major: 0, minor: 1, patch: 2 };
  if (levels[input] !== undefined) {
    const parts = current.split('.').map(Number);
    parts[levels[input]]++;
    for (let i = levels[input] + 1; i < 3; i++) parts[i] = 0;
    return parts.join('.');
  }
  if (/^\d+\.\d+\.\d+$/.test(input)) return input;
  console.error(`fatal: expected patch|minor|major or semver (e.g. 1.2.3), got "${input}".`);
  process.exit(1);
}

function changelogSection(version, date) {
  const range = lastTag() ? `${lastTag()}..HEAD` : 'HEAD';
  const log = capture('git', ['log', '--no-merges', '--format=%s', range]);
  const lines = log ? log.split('\n') : [];

  const categories = { feat: [], fix: [], docs: [], refactor: [], chore: [], other: [] };
  for (const line of lines) {
    if (isReleaseCommit(line)) continue;
    const match = line.match(/^(\w+)(?:\(.+?\))?!?:\s(.+)$/);
    if (match) {
      const type = match[1];
      const desc = match[2];
      if (Object.hasOwn(categories, type)) categories[type].push(desc);
      else categories.other.push(line);
    } else {
      categories.other.push(line);
    }
  }

  const breaking = lines.filter((l) => l.includes('BREAKING CHANGE') || /^\w+\(.+\)!:/.test(l));
  const label = {
    feat: 'Features',
    fix: 'Bug Fixes',
    docs: 'Documentation',
    refactor: 'Refactoring',
    chore: 'Chores',
    other: 'Other',
  };

  let md = `## [${version}] - ${date}\n\n`;
  if (breaking.length > 0) {
    md += '### ⚠ Breaking Changes\n\n';
    for (const b of breaking) md += `- ${b}\n`;
    md += '\n';
  }
  const categoryKeys = ['feat', 'fix', 'docs', 'refactor', 'chore', 'other'];
  for (const key of categoryKeys) {
    const items = categories[key];
    if (items.length === 0) continue;
    md += `### ${label[key]}\n\n`;
    for (const item of items) md += `- ${item}\n`;
    md += '\n';
  }

  return md.trimEnd() + '\n';
}

function isReleaseCommit(line) {
  return /^\w+(\(.+?\))?!?:\s*bump version to \d+\.\d+\.\d+/i.test(line);
}

function lastTag() {
  try {
    const tags = capture('git', ['tag', '--sort=-v:refname']);
    return tags ? tags.split('\n')[0] : null;
  } catch {
    return null;
  }
}

function updateChangelog(version, date) {
  const section = changelogSection(version, date);
  const header = `# Changelog\n\nAll notable changes to this project are documented here.\n\nThe format is based on [Keep a Changelog](https://keepachangelog.com/),\nand this project adheres to [Semantic Versioning](https://semver.org/).\n\n`;
  let content;
  if (existsSync(CHANGELOG)) {
    const existing = readFileSync(CHANGELOG, 'utf8');
    const bodyMatch = existing.match(/^# Changelog\n\n.*?\n\n/s);
    const bodyStart = bodyMatch ? bodyMatch[0].length : 0;
    content = existing.slice(0, bodyStart) + section + '\n' + existing.slice(bodyStart);
  } else {
    content = header + section + '\n';
  }
  if (dryRun) {
    console.log(`\n── CHANGELOG.md preview ──\n${section}\n── end preview ──\n`);
  } else {
    writeFileSync(CHANGELOG.pathname, content);
    console.log('Updated CHANGELOG.md');
  }
}

function updatePackageJson(version) {
  const pkg = JSON.parse(readFileSync(PKG, 'utf8'));
  pkg.version = version;
  if (dryRun) {
    console.log(`package.json version: ${pkg.version} -> ${version} (dry-run, not saved)`);
  } else {
    writeFileSync(PKG.pathname, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`Updated package.json to ${version}`);
  }
}

async function confirm(message) {
  const rl = createInterface({ input, output });
  const answer = await rl.question(message);
  rl.close();
  if (!answer.toLowerCase().startsWith('y')) {
    console.log('Aborted.');
    process.exit(0);
  }
}

if (!levelOrVersion) {
  console.log('Usage: node scripts/release.mjs <patch|minor|major|version> [--for-real]');
  process.exit(0);
}

const pkg = JSON.parse(readFileSync(PKG, 'utf8'));
const currentVersion = pkg.version;
const newVersion = computeVersion(currentVersion, levelOrVersion);
const date = new Date().toISOString().split('T', 1)[0];
const tag = `v${newVersion}`;

console.log(`Preparing release ${currentVersion} -> ${newVersion}${dryRun ? ' (DRY-RUN)' : ''}\n`);

checkCleanWorkingTree();
checkBranch();

if (!dryRun) {
  console.log('Pulling latest from remote...');
  run('git', ['pull', '--rebase']);
}

updateChangelog(newVersion, date);
updatePackageJson(newVersion);

if (dryRun) {
  console.log(`\nWould commit: "${tag}"`);
  console.log('Would tag:    ' + tag);
  await confirm('DRY-RUN — proceed with preview? (y/N) ');
  console.log('\nDry-run complete. Run with --for-real to execute.');
  console.log(`Then run: node scripts/publish.mjs --for-real`);
  process.exit(0);
}

await confirm(`Release v${newVersion} — commit, tag, and build? (y/N) `);

run('git', ['add', PKG.pathname, CHANGELOG.pathname]);
run('git', ['commit', '-m', `feat(package): bump version to ${newVersion}`]);
run('git', ['tag', tag]);
console.log(`Committed and tagged ${tag}`);

run('npm', ['run', 'typecheck']);
run('npm', ['run', 'test']);
run('npm', ['run', 'build']);

console.log(`\nRelease v${newVersion} prepared. Next step:`);
console.log(`  node scripts/publish.mjs --for-real`);
