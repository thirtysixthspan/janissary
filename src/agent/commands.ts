import type { AgentCommand } from './types.js';
import { agentNames } from './names.js';
import { getConfig } from '../config.js';
import { parseRemoteAddress } from '../remote/address.js';

const FLAGS = new Set(['-w', '--workspace', '--offline']);

// What "everything after `agent`" is left with once its clauses are lifted out. `on <address>` has
// to come out here alongside the flags or the address becomes part of the tab name
// (`bekir on devbox`) — and it has to come out for `resolveAgentName` too, which runs the same
// "everything after `agent`" match over the input. Walking tokens rather than matching a regex
// keeps the `on <address>` shape (a keyword plus one following token) unambiguous.
type AgentClauses = {
  words: string[];
  workspace: boolean;
  offline: boolean;
  // The token after `on`, or undefined when there is no clause. `clause` distinguishes "no `on`"
  // from "`on` with nothing after it", which is a usage error rather than a plain local launch.
  address?: string;
  clause: boolean;
};

function splitAgentClauses(input: string): AgentClauses {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  const words: string[] = [];
  const clauses: AgentClauses = { words, workspace: false, offline: false, clause: false };
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const lower = token.toLowerCase();
    if (FLAGS.has(lower)) {
      if (lower === '--offline') clauses.offline = true; else clauses.workspace = true;
      continue;
    }
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
  return words.slice(1).join(' ').toLowerCase().slice(0, getConfig().tabNameMaxLength);
}

export function resolveAgentName(
  input: string,
  existingLabels: string[],
): string | null {
  const named = nameFrom(splitAgentClauses(input).words);
  if (named) return named;

  const lowerExisting = new Set(existingLabels.map((l) => l.toLowerCase()));
  const pool = agentNames.filter((n) => !lowerExisting.has(n));
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
    workspace: clauses.workspace || clauses.clause,
    offline: clauses.offline,
    remote: remote && !('error' in remote) ? remote : undefined,
    remoteError: remote && 'error' in remote ? remote.error : undefined,
  };
}
