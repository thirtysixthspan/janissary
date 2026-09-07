// Prefixes that wrap another command; skip them to find the real program.
const WRAPPERS = new Set(['sudo', 'env', 'command', 'nice', 'nohup', 'time', 'doas', 'stdbuf']);

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

const basename = (token: string): string => token.replace(/^.*\//, '');

// One pipeline/sequence segment reduced to the program it actually runs and that program's first
// argument, with leading `VAR=value` assignments and wrapper commands (`sudo`, `env`, …) skipped.
export type CommandSegment = {
  program: string;
  argument?: string;
};

// The separators that split a command line into independently-run segments.
export const SEGMENT_SEPARATORS = /\|\||&&|[|;&]/;

/**
 * Break a command line into its segments' programs. Shared by the interactive-program name check
 * and by the learned-command store, so both agree on what "the program being run" means for a
 * wrapped, assignment-prefixed, or path-qualified invocation.
 */
export function commandSegments(command: string): CommandSegment[] {
  const segments: CommandSegment[] = [];
  for (const part of command.split(SEGMENT_SEPARATORS)) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    let index = 0;
    while (index < tokens.length && (ASSIGNMENT.test(tokens[index]) || WRAPPERS.has(basename(tokens[index])))) {
      index++;
    }
    const program = tokens[index];
    if (program) segments.push({ program: basename(program), argument: tokens[index + 1] });
  }
  return segments;
}
