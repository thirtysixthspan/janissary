import type { AgentCommand } from './types.js';
import { agentNames } from './names.js';
import { parseRemoteAddress } from '../remote/address.js';

const FLAGS = new Set(['-w', '--workspace', '--no-workspace', '--offline']);

export const AGENT_MODEL_USAGE = 'Usage: agent <name> --model <model-id>.';

// What "everything after `agent`" is left with once its clauses are lifted out. `on <address>` has
// to come out here alongside the flags or the address becomes part of the tab name
// (`bekir on devbox`) — and it has to come out for `resolveAgentName` too, which runs the same
// "everything after `agent`" match over the input. Walking tokens rather than matching a regex
// keeps both value-taking shapes (`on <address>`, `--model <value>`) unambiguous.
type AgentClauses = {
  words: string[];
  noWorkspace: boolean;
  offline: boolean;
  // The `--model` value, lifted out of `words` the same way the flags are so it can never become
  // part of the tab name. `modelError` is a `--model` with nothing after it.
  model?: string;
  modelError?: string;
  // The token after `on`, or undefined when there is no clause. `clause` distinguishes "no `on`"
  // from "`on` with nothing after it", which is a usage error rather than a plain local launch.
  address?: string;
  clause: boolean;
};

// The `--model` flag and the value it carries, consumed from `tokens` at `index`. Both spellings are
// accepted: `--model <value>` takes the next token the way the `on` clause does, and
// `--model=<value>` carries it inline. A flag with nothing usable after it is a usage error; a
// `--model` immediately followed by another flag takes that flag as its value, which the caller's
// catalog check then refuses — the same behavior `harness --model` has. Records onto `clauses` and
// returns how many further tokens the value took, or undefined when this token is not the flag.
function takeModelFlag(tokens: string[], index: number, token: string, clauses: AgentClauses): number | undefined {
  const lower = token.toLowerCase();
  const inline = lower.startsWith('--model=');
  if (lower !== '--model' && !inline) return undefined;
  const value = inline ? token.slice('--model='.length) : tokens[index + 1];
  if (!value) { clauses.modelError = AGENT_MODEL_USAGE; return 0; }
  clauses.model = value;
  return inline ? 0 : 1;
}

function splitAgentClauses(input: string): AgentClauses {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  const words: string[] = [];
  const clauses: AgentClauses = { words, noWorkspace: false, offline: false, clause: false };
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const lower = token.toLowerCase();
    if (FLAGS.has(lower)) {
      if (lower === '--no-workspace') clauses.noWorkspace = true;
      else if (lower === '--offline') clauses.offline = true;
      continue;
    }
    const consumed = takeModelFlag(tokens, index, token, clauses);
    if (consumed !== undefined) { index += consumed; continue; }
    if (lower === 'on' && index > 0) {
      clauses.clause = true;
      clauses.address = tokens[index + 1];
      index++;
      continue;
    }
    words.push(token);
  }
  return clauses;
}

// The tab name carried by "everything after `agent`", or '' when the input names none.
function nameFrom(words: string[]): string {
  if (words.length < 2 || words[0].toLowerCase() !== 'agent') return '';
  return words.slice(1).join(' ').toLowerCase();
}

export function resolveAgentName(
  input: string,
  existingLabels: string[],
): string | null {
  const named = nameFrom(splitAgentClauses(input).words);
  if (named) return named;

  const lowerExisting = new Set(existingLabels.map((l) => l.toLowerCase()));
  const pool = agentNames.filter((n) => !lowerExisting.has(n.toLowerCase()));
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function parseAgentCommand(input: string): AgentCommand {
  const clauses = splitAgentClauses(input);
  const remote = clauses.clause ? parseRemoteAddress(clauses.address) : undefined;
  return {
    name: nameFrom(clauses.words),
    // `on` implies a workspace: the remote server's only job is to provision a clone from its own
    // project root, so a remote launch without one has no meaning.
    workspace: clauses.clause || !clauses.noWorkspace,
    offline: clauses.offline,
    model: clauses.model,
    modelError: clauses.modelError,
    remote: remote && !('error' in remote) ? remote : undefined,
    remoteError: remote && 'error' in remote ? remote.error : undefined,
  };
}
