import { existsSync } from 'node:fs';
import path from 'node:path';
import { startServer } from './index.js';
import { makeToken } from './security.js';
import { initStateDirectories, clearStateDirectories } from './state-dirs.js';
import { acquireLock, releaseLock } from './instance-lock.js';
import { stopInstance } from './stop-instance.js';
import { scaffoldProject } from './project/init.js';
import { runRemoteServer } from './remote/serve-start.js';
import { parseE2EBrowserArgs, runE2EBrowser } from './browser/e2e-child.js';
import { loadConfig } from './config.js';
import { loadLearnedCommands } from './interactive/learned.js';
import { loadAgentNames } from './agent/names.js';
import { loadHarnessModels } from './harness/models.js';
import { loadProjectTokens } from './project/tokens.js';
import { loadGitIdentity } from './git/identity.js';
import { parseCliArgs, CliUsageError } from './cli-args.js';
import { usageText, appVersion } from './cli-info.js';
import { explainStartupError, formatFatal, maybeStack } from './startup-errors.js';
import { errorText } from './error-text.js';
import { closeApp, openApp } from './app-window.js';

// Set once the target directory is resolved in boot(), so the exit handler can release its lock.
let lockedDir: string | undefined;

// Set once args are parsed in boot(), so the top-level catch can include the attempted port
// in startup-error messages even though the catch itself sits outside boot()'s scope.
let parsedPort: number | undefined;

function killApp(): void {
  closeApp();
  if (lockedDir) { releaseLock(lockedDir); lockedDir = undefined; }
}

export async function boot(argv = process.argv.slice(2)): Promise<void> {
  const args = parseCliArgs(argv);
  parsedPort = args.port;

  if (args.help) {
    process.stdout.write(usageText());
    return;
  }

  if (args.version) {
    process.stdout.write(`${appVersion()}\n`);
    return;
  }

  // The remote half of an `on <address>` launch: it runs attached inside an ssh session, speaks the
  // frame protocol over stdin/stdout, and takes no instance lock, opens no window, and starts no
  // HTTP server — so it returns before any of the boot below.
  if (args.remoteServe) { runRemoteServer(args.remoteServePath); return; }

  // The confined browser behind a `-b` harness tab's protocol guard. Like `remote-serve` it is a
  // long-lived child of a janissary server rather than a server itself, so it takes no lock, opens
  // no window, and returns before the boot below. It runs until killed.
  if (args.e2eBrowser) {
    const parsed = parseE2EBrowserArgs(args.e2eBrowserArgs, process.env);
    if ('error' in parsed) throw new CliUsageError(parsed.error);
    await runE2EBrowser(parsed);
    return;
  }

  const cwd = args.projectDir ?? process.cwd();
  if (args.stop) { stopInstance(cwd); return; }
  if (args.init) {
    const created = scaffoldProject(cwd);
    process.stdout.write(`Scaffolded ai/ and product/ in ${cwd}:\n${created.map((dir) => `  ${dir}`).join('\n')}\nInstalled .codex/ and .claude/ configurations (standard files overwritten).\n`);
    return;
  }

  acquireLock(cwd);
  lockedDir = cwd;
  initStateDirectories({ projectDir: cwd, packageRoot: path.join(import.meta.dirname, '..') });
  loadConfig(cwd);
  loadLearnedCommands(cwd);
  loadAgentNames(cwd);
  loadHarnessModels(cwd);
  loadProjectTokens(cwd);
  loadGitIdentity(cwd);
  clearStateDirectories(args.relaunch);

  const webDir = path.join(import.meta.dirname, '..', 'web', 'dist');
  if (!existsSync(path.join(webDir, 'index.html'))) {
    throw new Error('web UI bundle not found (web/dist).\n  Run `npm run build:web` (or use `npm start`, which builds it first).');
  }
  const server = await startServer({ webDir, token: makeToken(), port: args.port, relaunch: args.relaunch, projectDir: cwd });

  // Machine-readable line first (the launcher may parse it), then a human line.
  process.stdout.write(`__JANUS_URL__ ${server.url}\n`);
  process.stderr.write(`\nJanissary is running at:\n  ${server.url}\n\nPress Ctrl+C to stop.\n`);
  if (!args.noOpen) openApp(server.url, cwd);

  const stop = () => { server.shutdown(); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  // Close the app window whenever the process exits (quit/exit, Ctrl+C, or normal shutdown).
  process.on('exit', killApp);
}

// Run when executed directly (node dist/main.js or tsx src/main.ts).
try {
  await boot();
} catch (error) {
  if (error instanceof CliUsageError) {
    process.stderr.write(`${error.message}\nTry 'janus --help' for more information.\n`);
    process.exit(2);
  }
  const explained = explainStartupError(error, { port: parsedPort });
  const message = explained ?? errorText(error);
  process.stderr.write(`${formatFatal(message)}\n${maybeStack(error)}`);
  process.exit(1);
}
