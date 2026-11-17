import { WEB_FETCH_USAGE } from './fetch/command.js';
import { WEB_SEARCH_USAGE } from './search/command.js';

export function isWebCommandLine(line: string): boolean {
  return /^web(\s|$)/i.test(line);
}

export function webSubcommand(line: string): 'search' | 'fetch' | undefined {
  const subcommand = line.trim().split(/\s+/, 2).at(1)?.toLowerCase();
  return subcommand === 'search' || subcommand === 'fetch' ? subcommand : undefined;
}

export const WEB_USAGE = `${WEB_SEARCH_USAGE}\n${WEB_FETCH_USAGE}`;
