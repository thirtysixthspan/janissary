#!/usr/bin/env node
// Captures the screenshots referenced by documentation/user-documentation/ pages, by launching the real app
// against fixture data and driving it with Playwright. Run via `./scripts/run.mjs docs-screenshots`
// (optionally passing shot names to capture a subset). The browser comes from browser.mjs: the one
// janissary attached to this tab inside a workspace, or a locally launched Chromium on a host.
//
// Each shot gets a fresh scratch directory (cwd and HOME both scratch-scoped — see scratch.mjs)
// and its own app process, so captures are deterministic and independent of shot order.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import manifest from './docs-screenshots/manifest.mjs';
import { openBrowser } from './docs-screenshots/browser.mjs';
import { captureShot } from './docs-screenshots/capture.mjs';
import { killJanus, spawnJanus } from './docs-screenshots/janus.mjs';
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
// about, and neither is worth a stack trace. The page server is already listening by this point, so
// it is closed here rather than left holding a port behind the exit.
async function openBrowserOrFail(closeServer) {
  try {
    return await openBrowser();
  } catch (error) {
    closeServer();
    fail(`No browser to drive: ${error.message}`);
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
const pageServer = await startPageServer(fixturesDirectory);
const { browser, release, source } = await openBrowserOrFail(pageServer.close);
console.log(`Driving ${source}`);
const failures = [];
const skipped = [];

try {
  for (const entry of entries) {
    if (entry.requiresBinary && !binaryOnPath(entry.requiresBinary)) {
      console.warn(`SKIP ${entry.name} — needs "${entry.requiresBinary}" on PATH; capture it manually and commit the PNG.`);
      skipped.push(entry.name);
      continue;
    }
    const scratch = createScratch(fixturesDirectory);
    let child;
    try {
      const spawned = spawnJanus(repoRoot, scratch);
      child = spawned.child;
      const url = await spawned.url;
      const setup = entry.setup?.map((command) => command.replace('{{PAGE_URL}}', () => pageServer.url));
      await captureShot(browser, url, { ...entry, setup }, path.join(outputDirectory, `${entry.name}.png`));
      console.log(`OK   ${entry.name}`);
    } catch (error) {
      failures.push(entry.name);
      console.error(`FAIL ${entry.name}: ${error.message}`);
    } finally {
      if (child) await killJanus(child);
      destroyScratch(scratch);
    }
  }
} finally {
  await release();
  pageServer.close();
}

if (skipped.length > 0) console.warn(`Skipped (binary unavailable): ${skipped.join(', ')}`);
if (failures.length > 0) fail(`Failed: ${failures.join(', ')}`);
console.log(`Saved ${entries.length - skipped.length} screenshot(s) to ${path.relative(repoRoot, outputDirectory)}`);
