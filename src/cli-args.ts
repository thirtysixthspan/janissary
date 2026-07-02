import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface CliArgs {
  help: boolean;
  version: boolean;
  relaunch: boolean;
  noOpen: boolean;
  port: number | undefined;
}

export function parseCliArgs(argv: string[]): CliArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      help: { type: 'boolean' },
      version: { type: 'boolean' },
      relaunch: { type: 'boolean' },
      'no-open': { type: 'boolean' },
      port: { type: 'string' },
    },
    strict: false,
  });

  return {
    help: Boolean(values.help),
    version: Boolean(values.version),
    relaunch: Boolean(values.relaunch),
    noOpen: Boolean(values['no-open']),
    port: typeof values.port === 'string' ? Number(values.port) : undefined,
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
