import { parseArgs } from 'node:util';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

export class CliUsageError extends Error {}

export interface CliArgs {
  help: boolean;
  version: boolean;
  relaunch: boolean;
  noOpen: boolean;
  port: number | undefined;
  projectDir: string | undefined;
}

export function parseCliArgs(argv: string[]): CliArgs {
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
      const raw = error instanceof Error ? error.message : String(error);
      const cleaned = raw.replace(/^TypeError \[[^\]]+]: /, '');
      throw new CliUsageError(cleaned);
    }
    throw error;
  }

  const port = typeof values.port === 'string' ? Number(values.port) : undefined;
  if (port !== undefined && !(Number.isSafeInteger(port) && port >= 1 && port <= 65_535)) {
    throw new CliUsageError(`invalid --port value: ${values.port}`);
  }

  let projectDir: string | undefined;
  if (positionals.length > 0) {
    const raw = positionals[0];
    const resolved = path.resolve(raw);
    if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
      throw new CliUsageError(`invalid project directory: ${raw} is not a directory`);
    }
    projectDir = resolved;
  }
  if (positionals.length > 1) {
    throw new CliUsageError(`unexpected argument: ${positionals[1]}`);
  }

  return {
    help: Boolean(values.help),
    version: Boolean(values.version),
    relaunch: Boolean(values.relaunch),
    noOpen: Boolean(values['no-open']),
    port,
    projectDir,
  };
}

export function usageText(): string {
  return `Usage: janus [options] [<project-dir>]

A terminal UI shell with built-in commands and shell execution.

Arguments:
  <project-dir>  Target directory (default: current directory)

Options:
  --port=<n>     Port to listen on (default: auto)
  --no-open      Start the server without opening the app window
  --relaunch     Reattach to existing state instead of clearing it
  --help         Show this help
  --version      Show version

Environment:
  JANUS_DEBUG=1  print stack traces on failure
`;
}

function readPackageInfo(): { name: string; version: string } {
  const packagePath = path.join(import.meta.dirname, '..', 'package.json');
  return JSON.parse(readFileSync(packagePath, 'utf8')) as { name: string; version: string };
}

export function appVersion(): string {
  const pkg = readPackageInfo();
  return `${pkg.name} ${pkg.version}`;
}

export function appVersionNumber(): string {
  return readPackageInfo().version;
}
