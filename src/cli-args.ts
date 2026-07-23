import { parseArgs } from 'node:util';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
export { usageText, appVersion, appVersionNumber } from './cli-info.js';

export class CliUsageError extends Error {}

export interface CliArgs {
  help: boolean;
  version: boolean;
  relaunch: boolean;
  noOpen: boolean;
  stop: boolean;
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

  // `stop` is a positional subcommand, not a project directory: `janus stop [<project-dir>]`
  // takes its own optional directory argument after the keyword.
  const stop = positionals[0] === 'stop';
  const projectDir = parseProjectDir(stop ? positionals.slice(1) : positionals);

  return {
    help: Boolean(values.help),
    version: Boolean(values.version),
    relaunch: Boolean(values.relaunch),
    noOpen: Boolean(values['no-open']),
    stop,
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
