import { mutateHostsFile } from './hosts-file.js';
import type { HostsChange, HostsMutation, HostsNotify } from './hosts-file.js';
import { sameHostName, validateHostFields } from './hosts-values.js';
import type { SavedHost } from './hosts-values.js';
import type { DeleteHostIntent, SaveHostIntent } from './shared.js';

export type HostEditOutcome =
  | { ok: false; error: string }
  | { ok: true; hosts: SavedHost[]; path: string; name: string };

function toOutcome(mutation: HostsMutation<string>): HostEditOutcome {
  if (!mutation.ok) return { ok: false, error: mutation.error };
  return { ok: true, hosts: mutation.hosts, path: mutation.path, name: mutation.result };
}

function applySave(
  hosts: SavedHost[], host: SavedHost, original: string | undefined,
): HostsChange<string> {
  const own = original === undefined
    ? undefined
    : hosts.find((candidate) => sameHostName(candidate.name, original));
  if (original !== undefined && own === undefined) {
    return { ok: false, error: `No host named "${original}".` };
  }
  const taken = hosts.find((candidate) => sameHostName(candidate.name, host.name));
  if (taken !== undefined && taken !== own) {
    return { ok: false, error: `Host "${host.name}" already exists.` };
  }
  if (own === undefined) {
    return { ok: true, hosts: [...hosts, host], result: host.name };
  }
  return {
    ok: true,
    hosts: hosts.map((candidate) => (candidate === own ? host : candidate)),
    result: host.name,
  };
}

export function saveHostEdit(
  intent: SaveHostIntent, root: string, home: string, notify: HostsNotify | undefined,
): HostEditOutcome {
  const validated = validateHostFields(intent.name, intent.user, intent.destination, intent.path);
  if (!validated.ok) return { ok: false, error: validated.error };
  const mutation = mutateHostsFile(
    root, home, notify, (hosts) => applySave(hosts, validated.host, intent.originalName),
  );
  return toOutcome(mutation);
}

export function deleteHostEdit(
  intent: DeleteHostIntent, root: string, home: string, notify: HostsNotify | undefined,
): HostEditOutcome {
  const name = intent.name;
  const mutation = mutateHostsFile(root, home, notify, (hosts) => {
    const match = hosts.find((candidate) => sameHostName(candidate.name, name));
    if (match === undefined) return { ok: false, error: `No host named "${name}".` };
    return {
      ok: true,
      hosts: hosts.filter((candidate) => candidate !== match),
      result: match.name,
    };
  });
  return toOutcome(mutation);
}
