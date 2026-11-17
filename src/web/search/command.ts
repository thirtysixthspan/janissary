import { positiveInteger } from '../../positive-integer.js';

export type WebSearchDepth = 'basic' | 'advanced';

export type WebSearchCommand = {
  query: string;
  numResults: number;
  maxChars: number;
  depth: WebSearchDepth;
  provider: string;
};

export const WEB_SEARCH_MIN_RESULTS = 1;

export const WEB_SEARCH_MAX_RESULTS = 20;

export const WEB_SEARCH_DEFAULT_RESULTS = 10;

export const WEB_SEARCH_MIN_CHARS = 200;

export const WEB_SEARCH_MAX_CHARS = 100_000;

export const WEB_SEARCH_DEFAULT_MAX_CHARS = 10_000;

export const WEB_SEARCH_DEFAULT_DEPTH: WebSearchDepth = 'basic';

export const WEB_SEARCH_DEFAULT_PROVIDER = 'auto';

export const WEB_SEARCH_USAGE =
  'Usage: web search <query> [--results <1-20>] [--max-chars <200-100000>] [--depth basic|advanced] [--provider <name>]';

export const WEB_SEARCH_PRIMER = [
  'To search the web, end your reply with one line:',
  'web search <query> [--results <1-20>] [--max-chars <200-100000>] [--depth basic|advanced] [--provider <name>]',
  'The result is a Markdown list of up to 10 results by default, each a title linked to its URL with a snippet beneath. For time-sensitive searches, include the year in the query; the search does not infer freshness.',
  '--depth advanced gives better snippets but costs more; use it only when basic results are not enough.',
  'Search only when the answer needs current or external information; never put file contents or secrets in a query.',
  'Example: web search node.js permission model 2026 --results 5',
].join('\n');

type ScannedArgs = Partial<Pick<WebSearchCommand, 'numResults' | 'maxChars' | 'depth' | 'provider'>>;

function flagValue(value: string | undefined): string | undefined {
  if (value === undefined || value.startsWith('--')) return undefined;
  return value;
}

function scanResults(scanned: ScannedArgs, value: string | undefined): number | undefined {
  const results = positiveInteger(value);
  if (results === undefined || scanned.numResults !== undefined) return undefined;
  if (results < WEB_SEARCH_MIN_RESULTS || results > WEB_SEARCH_MAX_RESULTS) return undefined;
  scanned.numResults = results;
  return 2;
}

function scanChars(scanned: ScannedArgs, value: string | undefined): number | undefined {
  const chars = positiveInteger(value);
  if (chars === undefined || scanned.maxChars !== undefined) return undefined;
  if (chars < WEB_SEARCH_MIN_CHARS || chars > WEB_SEARCH_MAX_CHARS) return undefined;
  scanned.maxChars = chars;
  return 2;
}

function scanDepth(scanned: ScannedArgs, value: string | undefined): number | undefined {
  const depth = flagValue(value)?.toLowerCase();
  if ((depth !== 'basic' && depth !== 'advanced') || scanned.depth !== undefined) return undefined;
  scanned.depth = depth;
  return 2;
}

function scanProvider(scanned: ScannedArgs, value: string | undefined): number | undefined {
  const provider = flagValue(value);
  if (provider === undefined || scanned.provider !== undefined) return undefined;
  scanned.provider = provider;
  return 2;
}

function scanFlag(scanned: ScannedArgs, flag: string, value: string | undefined): number | undefined {
  switch (flag) {
    case '--results': {
      return scanResults(scanned, value);
    }
    case '--max-chars': {
      return scanChars(scanned, value);
    }
    case '--depth': {
      return scanDepth(scanned, value);
    }
    case '--provider': {
      return scanProvider(scanned, value);
    }
    default: {
      return undefined;
    }
  }
}

function scanArguments(tokens: string[]): ScannedArgs | undefined {
  const scanned: ScannedArgs = {};
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (!token.startsWith('--')) return undefined;
    const consumed = scanFlag(scanned, token, tokens[index + 1]);
    if (consumed === undefined) return undefined;
    index += consumed;
  }
  return scanned;
}

export function parseWebSearch(input: string): WebSearchCommand | { error: string } {
  const [command, subcommand, ...rest] = input.trim().split(/\s+/);
  if (command.toLowerCase() !== 'web' || subcommand?.toLowerCase() !== 'search') return { error: WEB_SEARCH_USAGE };
  const flagStart = rest.findIndex((token) => token.startsWith('--'));
  const query = (flagStart === -1 ? rest : rest.slice(0, flagStart)).join(' ');
  if (query === '') return { error: WEB_SEARCH_USAGE };
  const scanned = scanArguments(flagStart === -1 ? [] : rest.slice(flagStart));
  if (scanned === undefined) return { error: WEB_SEARCH_USAGE };
  return {
    query,
    numResults: scanned.numResults ?? WEB_SEARCH_DEFAULT_RESULTS,
    maxChars: scanned.maxChars ?? WEB_SEARCH_DEFAULT_MAX_CHARS,
    depth: scanned.depth ?? WEB_SEARCH_DEFAULT_DEPTH,
    provider: scanned.provider ?? WEB_SEARCH_DEFAULT_PROVIDER,
  };
}

export function isWebSearchReplyLine(line: string): boolean {
  return /^web\s+search(\s|$)/.test(line);
}
