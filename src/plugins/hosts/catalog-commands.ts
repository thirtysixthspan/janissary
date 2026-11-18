import { mutateHostsFile, readHostsFile, serializeHosts } from './hosts-file.js';
import type { HostsMutation, HostsNotify } from './hosts-file.js';
import { isHostName, sameHostName, validateHostFields } from './hosts-values.js';
import type { SavedHost } from './hosts-values.js';

const USAGE = 'Usage: hosts [list|add|remove].';
const ADD_USAGE = 'Usage: hosts add <name> <[user@]host[:port]> [path]';
const REMOVE_USAGE = 'Usage: hosts remove <name>';

export type CatalogParse =
  | { kind: 'open' }
  | { kind: 'list' }
  | { kind: 'add'; host: SavedHost }
  | { kind: 'remove'; name: string }
  | { kind: 'refusal'; reason: string };

export type CatalogOutcome =
  | { kind: 'open' }
  | { kind: 'output'; text: string }
  | { kind: 'refusal'; reason: string }
  | { kind: 'mutation'; text: string; hosts: SavedHost[]; path: string };

function refusal(reason: string): CatalogParse {
  return { kind: 'refusal', reason };
}

function parseAdd(words: string[]): CatalogParse {
  if (words.length < 3 || words.length > 4) return refusal(ADD_USAGE);
  const name = words[1];
  const token = words[2];
  const path = words[3];
  const at = token.indexOf('@');
  if (at === -1) {
    const validated = validateHostFields(name, undefined, token, path);
    return validated.ok ? { kind: 'add', host: validated.host } : refusal(validated.error);
  }
  const user = token.slice(0, at);
  const destination = token.slice(at + 1);
  if (user.length === 0 || destination.includes('@')) return refusal(ADD_USAGE);
  const validated = validateHostFields(name, user, destination, path);
  return validated.ok ? { kind: 'add', host: validated.host } : refusal(validated.error);
}

function parseRemove(words: string[]): CatalogParse {
  if (words.length !== 2) return refusal(REMOVE_USAGE);
  const name = words[1];
  if (isHostName(name)) return { kind: 'remove', name };
  const validated = validateHostFields(name, undefined, 'host', undefined);
  return refusal(validated.ok ? REMOVE_USAGE : validated.error);
}

export function parseCatalogCommand(argument: string): CatalogParse {
  const words = argument.trim().split(/\s+/u).filter((word) => word.length > 0);
  if (words.length === 0) return { kind: 'open' };
  const verb = words[0].toLowerCase();
  if (verb === 'list') return words.length === 1 ? { kind: 'list' } : refusal(USAGE);
  if (verb === 'add') return parseAdd(words);
  if (verb === 'remove') return parseRemove(words);
  return refusal(USAGE);
}

function mutationOutcome(mutation: HostsMutation<string>): CatalogOutcome {
  if (!mutation.ok) return { kind: 'refusal', reason: mutation.error };
  return {
    kind: 'mutation', text: mutation.result, hosts: mutation.hosts, path: mutation.path,
  };
}

export function runCatalogCommand(
  argument: string, root: string, home: string, notify?: HostsNotify,
): CatalogOutcome {
  const parsed = parseCatalogCommand(argument);
  if (parsed.kind === 'open') return { kind: 'open' };
  if (parsed.kind === 'refusal') return { kind: 'refusal', reason: parsed.reason };
  if (parsed.kind === 'list') {
    const read = readHostsFile(root, home, notify);
    return { kind: 'output', text: serializeHosts(read.hosts) };
  }
  if (parsed.kind === 'add') {
    const added = parsed.host;
    const mutation = mutateHostsFile(root, home, notify, (hosts) => {
      const match = hosts.find((host) => sameHostName(host.name, added.name));
      if (match === undefined) {
        return { ok: true, hosts: [...hosts, added], result: `Host ${added.name} added.` };
      }
      return {
        ok: true,
        hosts: hosts.map((host) => (sameHostName(host.name, added.name) ? added : host)),
        result: `Host ${added.name} updated.`,
      };
    });
    return mutationOutcome(mutation);
  }
  const name = parsed.name;
  const mutation = mutateHostsFile(root, home, notify, (hosts) => {
    const match = hosts.find((host) => sameHostName(host.name, name));
    if (match === undefined) return { ok: false, error: `No host named "${name}".` };
    return {
      ok: true,
      hosts: hosts.filter((host) => !sameHostName(host.name, name)),
      result: `Host ${match.name} removed.`,
    };
  });
  return mutationOutcome(mutation);
}
