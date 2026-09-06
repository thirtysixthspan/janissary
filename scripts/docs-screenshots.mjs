#!/usr/bin/env node
// Captures the screenshots referenced by documentation/user-documentation/ pages, by driving the
// real app against fixture data with Playwright. Run via `./scripts/run.mjs docs-screenshots`
// (optionally passing shot names to capture a subset). The browser comes from browser.mjs: the one
// janissary attached to this tab inside a workspace, or a locally launched Chromium on a host.
//
// One janissary instance and one browser page serve every shot in the run, and both are torn down
// when the last one is captured. Holding the page open is what keeps the session alive — janissary
// quits about a second after its last websocket client leaves — so shots are separated by a reset
// (see reset.mjs) rather than by a relaunch.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import manifest from './docs-screenshots/manifest.mjs';
import { openBrowser } from './docs-screenshots/browser.mjs';
import { captureShot } from './docs-screenshots/capture.mjs';
import { resetApp } from './docs-screenshots/reset.mjs';
import { openSession } from './docs-screenshots/session.mjs';
import { createScratch, destroyScratch, startPageServer } from './docs-screenshots/scratch.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturesDirectory = path.join(repoRoot, 'scripts', 'docs-screenshots', 'fixtures');
const outputDirectory = path.join(repoRoot, 'documentation', 'public', 'screenshots');

function fail(message) {
  console.error(message);
  process.exit(1);
}

// A browser that cannot be acquired is a reason, not a crash: an attached browser that has died
// (nothing restarts one) and a host with no Chromium installed are both ordinary states to be told
// about, and neither is worth a stack trace. Whatever is already holding a port or a directory by
// this point is released on the way out.
async function openBrowserOrFail(release) {
  try {
    return await openBrowser();
  } catch (error) {
    release();
    fail(`No browser to drive: ${error.message}`);
  }
}

// Likewise for the app: a port taken between choosing and binding it, or a lock the scratch
// directory somehow already holds, is a sentence rather than a rejected promise.
async function openSessionOrFail(options, release) {
  try {
    return await openSession(options);
  } catch (error) {
    await release();
    fail(`No janissary to drive: ${error.message}`);
  }
}

function binaryOnPath(binary) {
  try {
    execFileSync('which', [binary], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

if (!existsSync(path.join(repoRoot, 'web', 'dist', 'index.html'))) {
  fail('Web bundle missing — run `npm run build:web` first (screenshots capture the built UI).');
}

const only = new Set(process.argv.slice(2));
const entries = manifest.filter((entry) => only.size === 0 || only.has(entry.name));
if (entries.length === 0) fail(`No manifest entries match: ${[...only].join(', ')}`);

mkdirSync(outputDirectory, { recursive: true });
const scratch = createScratch(fixturesDirectory);
const pageServer = await startPageServer(fixturesDirectory);
const closeFixtures = () => {
  pageServer.close();
  destroyScratch(scratch);
};

const { browser, release, source } = await openBrowserOrFail(closeFixtures);
console.log(`Driving ${source}`);
const session = await openSessionOrFail({ repoRoot, scratch, browser }, async () => {
  await release();
  closeFixtures();
});

const failures = [];
const skipped = [];

try {
  for (const entry of entries) {
    if (entry.requiresBinary && !binaryOnPath(entry.requiresBinary)) {
      console.warn(`SKIP ${entry.name} — needs "${entry.requiresBinary}" on PATH; capture it manually and commit the PNG.`);
      skipped.push(entry.name);
      continue;
    }
    try {
      // Before every shot, including the first, so a run that captures a subset produces the same
      // bytes for those shots as a full run does.
      await resetApp(session.page, scratch);
      const setup = entry.setup?.map((command) => command.replace('{{PAGE_URL}}', () => pageServer.url));
      await captureShot(session.page, { ...entry, setup }, path.join(outputDirectory, `${entry.name}.png`));
      console.log(`OK   ${entry.name}`);
    } catch (error) {
      failures.push(entry.name);
      console.error(`FAIL ${entry.name}: ${error.message}`);
    }
  }
} finally {
  await session.close();
  await release();
  closeFixtures();
}

if (skipped.length > 0) console.warn(`Skipped (binary unavailable): ${skipped.join(', ')}`);
if (failures.length > 0) fail(`Failed: ${failures.join(', ')}`);
console.log(`Saved ${entries.length - skipped.length} screenshot(s) to ${path.relative(repoRoot, outputDirectory)}`);
