// Which browser a screenshot run drives. Two sources, in order: the browser janissary attached to
// this tab (a workspace launched with `-b`), and otherwise a Chromium this process launches itself.
// The sandbox denies reading Playwright's browser cache under `$HOME`, so inside a workspace the
// attached browser is the only one reachable at all.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const CONNECT_RETRY_MS = 1000;

const require_ = createRequire(import.meta.url);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Both variables or neither: an endpoint without the client path janissary published is unusable,
// because Playwright's client and server must be the same build to connect at all and the project's
// own copy is a different one. Falling back to a launch beats failing on a version mismatch that
// reads like a network error.
export function attachedBrowserFromEnv(env) {
  const endpoint = env.JANISSARY_BROWSER_WS_ENDPOINT;
  const clientPath = env.JANISSARY_PLAYWRIGHT;
  if (!endpoint || !clientPath) return;
  return { endpoint, clientPath };
}

// The endpoint is handed out before Chromium has finished starting, deliberately — nothing about the
// tab waits on the browser — so a connect in the first fraction of a second can lose that race
// exactly once. One retry covers it; a failure that survives it is a real one.
export async function connectAttached(client, endpoint, options = {}) {
  const delay = options.retryDelayMs ?? CONNECT_RETRY_MS;
  const wait = options.sleep ?? sleep;
  try {
    return await client.connect(endpoint);
  } catch {
    await wait(delay);
    return await client.connect(endpoint);
  }
}

async function openAttached(attached) {
  const client = require_(attached.clientPath).chromium;
  const browser = await connectAttached(client, attached.endpoint);
  // Deliberately not `browser.close()`. This connection is a client of janissary's own
  // `chromium.launchServer()` child, so closing the browser closes the *remote* one, the child exits
  // on its server's close event, and the tab is left advertising an endpoint that refuses every
  // later connect. Each shot's context is already closed in capture.mjs; the connection itself goes
  // when this process does.
  return { browser, release: () => {}, source: `attached janissary browser at ${attached.endpoint}` };
}

async function openLaunched() {
  const executable = chromium.executablePath();
  if (!executable || !existsSync(executable)) {
    throw new Error('Playwright Chromium is not installed — run `npm run playwright:install-chromium` first.');
  }
  const browser = await chromium.launch();
  return { browser, release: () => browser.close(), source: 'a locally launched Chromium' };
}

export async function openBrowser(env = process.env) {
  const attached = attachedBrowserFromEnv(env);
  return attached ? openAttached(attached) : openLaunched();
}
