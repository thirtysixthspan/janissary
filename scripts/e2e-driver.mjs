// Runs one driver against the running app, in one browser connection, and keeps its evidence whatever
// the driver does. This is the entry point a spec-testing run drives the app through:
//
//   ./scripts/run.mjs e2e-driver <driver.mjs> --log <project-dir>/.janissary/log/server.log \
//     --scratch ./temp/find-bugs --out viewer
//
// The driver is a module with a default export taking `{ page, record, out, shot, press, runCommand,
// tabs, tabSummary, dialogs, notifications, watchRequests, viewer, editor, canvasSignature, logs }`.
// It writes what it learns into `record`, and the runner writes `record` to `<scratch>/<out>.json`
// after the driver returns *or throws* — a run that dies at step nine still has steps one through
// eight on disk, which is the whole reason this is a runner rather than a bare import.
//
// One driver, one connection. See `e2e/session.mjs` for why: every `chromium.connect()` is its own
// browser session, and the app exits about a second after its last client leaves, so a second driver
// run is a second app instance rather than a second page. The address comes from the app's own log,
// so no token is ever passed on a command line or written into a scratch file.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as inspect from './e2e/inspect.mjs';
import * as imageTab from './e2e/inspect-image-tab.mjs';
import { openSession, readAppUrl } from './e2e/session.mjs';

const DEFAULT_SCRATCH = 'temp/e2e';
const DEFAULT_OUT = 'result';

function parseArguments(argv) {
  const options = {
    driver: undefined,
    log: process.env.JANISSARY_SERVER_LOG,
    appUrl: process.env.JANISSARY_APP_URL,
    scratch: DEFAULT_SCRATCH,
    out: DEFAULT_OUT,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = () => {
      index += 1;
      return argv[index];
    };
    switch (argument) {
      case '--log': { options.log = value(); break; }
      case '--scratch': { options.scratch = value(); break; }
      case '--out': { options.out = value(); break; }
      case '--url': { options.appUrl = value(); break; }
      case '--help':
      case '-h': { options.help = true; break; }
      default: {
        if (argument.startsWith('-')) throw new Error(`unknown option ${argument}`);
        if (options.driver !== undefined) throw new Error(`unexpected argument ${argument}`);
        options.driver = argument;
      }
    }
  }
  return options;
}

const usage = 'usage: ./scripts/run.mjs e2e-driver <driver.mjs> [--log <server.log>] [--scratch <dir>] [--out <name>]';

const options = parseArguments(process.argv.slice(2));

if (options.help || !options.driver) {
  console.log(usage);
  process.exit(options.help ? 0 : 1);
}

const appUrl = options.appUrl ?? readAppUrl(options.log);
const driverPath = path.resolve(options.driver);
const record = {};
let failure;

try {
  const session = await openSession({ appUrl, scratchDir: options.scratch });
  try {
    const module = await import(driverPath);
    if (typeof module.default !== 'function') throw new Error(`${options.driver} has no default export`);
    await module.default({ ...session, ...inspect, ...imageTab, record });
  } finally {
    record.consoleLog = session.logs;
    await session.close();
  }
} catch (error) {
  failure = error;
  record.error = error instanceof Error ? error.message : String(error);
}

mkdirSync(options.scratch, { recursive: true });
const written = path.join(options.scratch, `${options.out}.json`);
writeFileSync(written, `${JSON.stringify(record, null, 2)}\n`);
process.stdout.write(`wrote ${written}\n`);

if (failure) {
  process.stderr.write(`${failure instanceof Error ? failure.stack : String(failure)}\n`);
  process.exit(1);
}
