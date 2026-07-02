import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export class CliUsageError extends Error {}

export interface CliArgs {
  help: boolean;
  version: boolean;
  relaunch: boolean;
  noOpen: boolean;
  port: number | undefined;
}

export function parseCliArgs(argv: string[]): CliArgs {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        help: { type: 'boolean' },
        version: { type: 'boolean' },
        relaunch: { type: 'boolean' },
        'no-open': { type: 'boolean' },
        port: { type: 'string' },
      },
      strict: true,
      allowPositionals: false,
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

  return {
    help: Boolean(values.help),
    version: Boolean(values.version),
    relaunch: Boolean(values.relaunch),
    noOpen: Boolean(values['no-open']),
    port,
  };
}

export function usageText(): string {
  return `Usage: janus [options]

A terminal UI shell with built-in commands and shell execution.

Options:
  --port=<n>    Port to listen on (default: auto)
  --no-open     Start the server without opening the app window
  --relaunch    Reattach to existing state instead of clearing it
  --help        Show this help
  --version     Show version
`;
}

export function appVersion(): string {
  const packagePath = path.join(import.meta.dirname, '..', 'package.json');
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8')) as { name: string; version: string };
  return `${pkg.name} ${pkg.version}`;
}
