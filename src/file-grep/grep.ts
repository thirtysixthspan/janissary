import { compileMatcher, patternError } from '../search/compile-matcher.js';
import type { FileGrepArgs } from './command.js';
import { parseFileGrep } from './command.js';
import { discoverGrepCandidates } from './candidates.js';
import { withDeadline } from './deadline.js';
import { formatGrepResult } from './format.js';
import type { GrepSearchTarget } from './path-target.js';
import { resolveGrepTarget } from './path-target.js';
import { GREP_TIMEOUT_MS, grepMatcherModes, scanFiles } from './scan.js';

const LITERAL_HINT = 'Use --literal to search for the text as typed.';

type DiscoveryResult = { kind: 'paths'; paths: string[] } | { kind: 'timeout'; text: string };

function diagnostic(args: FileGrepArgs): string | undefined {
  const modes = grepMatcherModes(args);
  const error = patternError(args.pattern, modes);
  if (error !== null) return `${error}\n${LITERAL_HINT}`;
  if (compileMatcher(args.pattern, modes) === null) {
    return `Pattern matches empty text, so it would match every line: ${args.pattern}.`;
  }
}

async function discover(target: GrepSearchTarget, args: FileGrepArgs, deadline: number): Promise<DiscoveryResult> {
  const controller = new AbortController();
  try {
    const result = await withDeadline(
      deadline,
      () => discoverGrepCandidates(target, args.include, args.exclude, controller.signal),
    );
    if (result.kind === 'timeout') return { kind: 'timeout', text: formatGrepResult([], { kind: 'timeout' }) };
    return { kind: 'paths', paths: result.value };
  } finally {
    controller.abort();
  }
}

export async function grepWorkspace(root: string, args: FileGrepArgs, deadline: number): Promise<string> {
  const failure = diagnostic(args);
  if (failure !== undefined) return failure;
  const resolution = await withDeadline(deadline, () => resolveGrepTarget(root, args.path));
  if (resolution.kind === 'timeout') return formatGrepResult([], { kind: 'timeout' });
  const target = resolution.value;
  if (target.kind === 'failure') return target.text;
  if (target.kind === 'skip') return formatGrepResult([], undefined);
  const discovery = await discover(target, args, deadline);
  if (discovery.kind === 'timeout') return discovery.text;
  const result = await scanFiles(target.root, discovery.paths, args, deadline);
  return formatGrepResult(result.rows, result.ending);
}

export async function grepWorkspaceCommand(root: string, input: string): Promise<string> {
  const parsed = parseFileGrep(input);
  if ('error' in parsed) return parsed.error;
  return grepWorkspace(root, parsed, Date.now() + GREP_TIMEOUT_MS);
}
