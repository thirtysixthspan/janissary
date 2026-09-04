import { parseArgs } from 'node:util';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { errorText } from './error-text.js';
export { usageText, appVersion, appVersionNumber } from './cli-info.js';

export class CliUsageError extends Error {}

export interface CliArgs {
  help: boolean;
  version: boolean;
  relaunch: boolean;
  noOpen: boolean;
  stop: boolean;
  init: boolean;
  // `janus remote-serve [<project-dir>]`: run as the far end of a remote janissary session (see
  // product/specs/remote-server.md). Its directory argument names a path on *this* machine but is
  // deliberately not validated here — an unusable path is reported to the local side as a
  // workspace-failed frame, not as a CLI usage error.
  remoteServe: boolean;
  remoteServePath: string | undefined;
  // `janus e2e-browser --port <n> --ws-path <token> --dir <path>`: run as the confined browser
  // server behind a `-b` harness tab's protocol guard (see product/specs/harness.md). Its own flags
  // are parsed by `parseE2EBrowserArgs` from the raw argv rather than here, since they are never
  // typed by a user — `startE2EBrowserServer` is the only caller.
  e2eBrowser: boolean;
  e2eBrowserArgs: string[];
  port: number | undefined;
  projectDir: string | undefined;
}

// The `e2e-browser` subcommand's own args (`--ws-path`, `--dir`) are not declared to `parseArgs`, so
// strict mode would reject them as unknown options. It is recognized before any option parsing and
// its arguments are handed on verbatim for `parseE2EBrowserArgs` to read.
function e2eBrowserCommand(rest: string[]): CliArgs {
  return {
    help: false, version: false, relaunch: false, noOpen: false,
    stop: false, init: false, remoteServe: false, remoteServePath: undefined,
    e2eBrowser: true, e2eBrowserArgs: rest,
    port: undefined, projectDir: undefined,
  };
}

export function parseCliArgs(argv: string[]): CliArgs {
  if (argv[0] === 'e2e-browser') return e2eBrowserCommand(argv.slice(1));

  let values: Record<string, string | boolean | string[] | undefined>;
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: argv,
      options: {
        help: { type: 'boolean' },
        version: { type: 'boolean' },
        relaunch: { type: 'boolean' },
        'no-open': { type: 'boolean' },
        port: { type: 'string' },
      },
      strict: true,
      allowPositionals: true,
    }));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (typeof code === 'string' && code.startsWith('ERR_PARSE_ARGS')) {
      const raw = errorText(error);
      const cleaned = raw.replace(/^TypeError \[[^\]]+]: /, '');
      throw new CliUsageError(cleaned);
    }
    throw error;
  }

  const port = typeof values.port === 'string' ? Number(values.port) : undefined;
  if (port !== undefined && !(Number.isSafeInteger(port) && port >= 1 && port <= 65_535)) {
    throw new CliUsageError(`invalid --port value: ${values.port}`);
  }

  // `stop`, `init`, `remote-serve`, and `e2e-browser` are positional subcommands, not a project
  // directory: each takes its own arguments after the keyword.
  const stop = positionals[0] === 'stop';
  const init = positionals[0] === 'init';
  const remoteServe = positionals[0] === 'remote-serve';
  const projectDir = remoteServe ? undefined : parseProjectDir(stop || init ? positionals.slice(1) : positionals);

  return {
    help: Boolean(values.help),
    version: Boolean(values.version),
    relaunch: Boolean(values.relaunch),
    noOpen: Boolean(values['no-open']),
    stop,
    init,
    remoteServe,
    remoteServePath: remoteServe ? positionals[1] : undefined,
    e2eBrowser: false,
    e2eBrowserArgs: [],
    port,
    projectDir,
  };
}

// Resolve the optional `<project-dir>` positional (whatever remains after any leading `stop`
// keyword has been stripped) to an absolute path, validating it exists and is a directory.
function parseProjectDir(dirPositionals: string[]): string | undefined {
  if (dirPositionals.length === 0) return undefined;
  const raw = dirPositionals[0];
  const resolved = path.resolve(raw);
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    throw new CliUsageError(`invalid project directory: ${raw} is not a directory`);
  }
  if (dirPositionals.length > 1) {
    throw new CliUsageError(`unexpected argument: ${dirPositionals[1]}`);
  }
  return resolved;
}
