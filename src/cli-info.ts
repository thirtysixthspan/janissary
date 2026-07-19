import { readFileSync } from 'node:fs';
import path from 'node:path';

// Static/display info split out of cli-args.ts: usage text and package version, as opposed to
// the actual argument-parsing logic that remains there.

export function usageText(): string {
  return `Usage: janus [options] [<project-dir>]
       janus stop [<project-dir>]

A terminal UI shell with built-in commands and shell execution.

Arguments:
  <project-dir>  Target directory (default: current directory)

Commands:
  stop           Stop the running instance for a directory

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
