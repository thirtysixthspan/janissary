// Driving the browser janissary attached to this tab, for a run that has to exercise the app rather
// than read it. Two facts from `ai/guidelines/sandbox-e2e-browser.md` shape every decision here.
//
// First, `chromium.connect()` is its own session with its own browser: a second connect is a
// different browser, not a second window onto the first one's page. Second, janissary shuts itself
// down about a second after its last websocket client disconnects. Together they mean one connection
// per batch of work, held open from the first interaction to the last — and that a background holder
// process cannot keep the app alive for the *next* script. Observed in a find-bugs run: a holder's
// page was a client for as long as it was the only connection, a second driver's connect left it
// holding nothing, and the app exited on its own seconds later. A run that wants a second batch
// starts a second instance, or folds the work into one driver.

import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const URL_MARKER = '__JANUS_URL__ ';
const CONNECT_RETRY_MS = 1000;
const APP_READY = '.tabstrip';
const READY_TIMEOUT_MS = 15_000;
const DEFAULT_VIEWPORT = { width: 1280, height: 800 };
const DEFAULT_SCRATCH = 'temp/e2e';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Both variables or neither. A browser is not something a run may go and find for itself: inside a
// workspace the sandbox denies reading Playwright's own Chromium, so a missing variable means this
// tab was launched without `-b` and the human has to relaunch it.
export function attachedBrowserFromEnv(env) {
  const endpoint = env.JANISSARY_BROWSER_WS_ENDPOINT;
  const clientPath = env.JANISSARY_PLAYWRIGHT;
  if (!endpoint || !clientPath) {
    throw new Error(
      'no attached browser: JANISSARY_BROWSER_WS_ENDPOINT and JANISSARY_PLAYWRIGHT must both be set. '
      + 'Relaunch this tab with -b (harness <name> -b, or E2E browser in the New harness dialog).',
    );
  }
  return { endpoint, clientPath };
}

// The address the start task's launcher printed, read back off the app's own log rather than written
// down anywhere: it carries the session token, and a token pasted into a driver, a scratch file, a
// report, or a commit is a credential this project has no reason to persist.
export function readAppUrl(serverLogPath) {
  const line = readFileSync(serverLogPath, 'utf8')
    .split('\n')
    .findLast((candidate) => candidate.startsWith(URL_MARKER));
  if (line === undefined) {
    throw new Error(`no ${URL_MARKER.trim()} line in ${serverLogPath} — is the app running?`);
  }
  return line.slice(URL_MARKER.length).trim();
}

// The first connect is a request for a browser, and it is patient while Chromium comes up, so a
// loss in the first fraction of a second is the documented race rather than a fault. One retry
// covers it; anything that survives it is real.
async function connect(client, endpoint) {
  try {
    return await client.connect(endpoint);
  } catch {
    await sleep(CONNECT_RETRY_MS);
    return await client.connect(endpoint);
  }
}

async function ignoringFailure(what) {
  try {
    await what();
  } catch {
    // The connection can already be gone, and a page or context this run opened is not worth a
    // teardown error over: the browser it belonged to is not this run's to close either way.
  }
}

// Evidence for a run's own scratch root: a screenshot to look at, and the text a report quotes. Both
// are scratch — the caller decides what to keep before the teardown deletes the root.
export function out(scratchDir, name, value) {
  const target = path.join(scratchDir, name);
  mkdirSync(path.dirname(target), { recursive: true });
  const text = typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(target, text);
  process.stdout.write(`wrote ${target}\n`);
}

export async function shot(scratchDir, page, name) {
  const target = path.join(scratchDir, `${name}.png`);
  await page.screenshot({ path: target });
  process.stdout.write(`wrote ${target}\n`);
}

export async function openSession({
  appUrl, viewport = DEFAULT_VIEWPORT, scratchDir = DEFAULT_SCRATCH, env = process.env,
} = {}) {
  if (!appUrl) throw new Error('openSession needs the app address (see readAppUrl)');
  const { endpoint, clientPath } = attachedBrowserFromEnv(env);
  const chromium = createRequire(import.meta.url)(clientPath).chromium;
  const browser = await connect(chromium, endpoint);
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const logs = [];
  page.on('console', (message) => { logs.push(`[${message.type()}] ${message.text()}`); });
  page.on('pageerror', (error) => { logs.push(`[pageerror] ${error.message}`); });
  mkdirSync(scratchDir, { recursive: true });
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(APP_READY, { timeout: READY_TIMEOUT_MS });
  return {
    browser, context, page, logs, viewport, scratchDir,
    out: (name, value) => out(scratchDir, name, value),
    shot: (name) => shot(scratchDir, page, name),
    // Deliberately not closing the browser: it belongs to the tab, and asking the browser itself to
    // close is refused by the guard besides. The page and the context are this run's to give back.
    close: () => closeSession({ page, context }),
  };
}

export async function closeSession({ page, context }) {
  await ignoringFailure(() => page.close());
  await ignoringFailure(() => context.close());
}
