import { homedir } from 'node:os';
import type { Managers } from '../managers.js';
import { notify } from '../notifications/index.js';
import { readHostsFile } from '../plugins/hosts/hosts-file.js';
import { isHostName, sameHostName } from '../plugins/hosts/hosts-values.js';
import type { SavedHost } from '../plugins/hosts/hosts-values.js';
import type { RemoteAddress } from './address.js';

// Resolve a bare saved name against the effective catalog. A token that is not a bare name, or one
// with no exact case-folded match, is left to the literal launch path.
export function resolveSavedHost(token: string, hosts: readonly SavedHost[]): RemoteAddress | undefined {
  if (!isHostName(token)) return undefined;
  const saved = hosts.find((host) => sameHostName(host.name, token));
  if (saved === undefined) return undefined;
  const destination = saved.user === undefined ? saved.host : `${saved.user}@${saved.host}`;
  return {
    address: `${destination}${saved.path === undefined ? '' : `:${saved.path}`}`,
    destination,
    host: saved.host,
    ...(saved.path !== undefined && { path: saved.path }),
    ...(saved.port !== undefined && { port: saved.port }),
    hostName: saved.name,
  };
}

// Resolve the `on` operand once, before a channel opens, so the shell and harness executors share one
// concrete endpoint for channel setup, tab metadata, and any name-refusal retry. A qualified token
// (`@` or `:`) is a literal address the catalog has no say in. The catalog's own shared, deduplicated
// "unusable file" report is forwarded to the origin's transcript; an unusable catalog or an unmatched
// name keeps the parsed address. A usable home catalog can still supply a match after a malformed
// project override has been reported, because readHostsFile falls back to it.
export function resolveRemoteLaunchAddress(
  managers: Managers, originLabel: string, parsed: RemoteAddress,
): RemoteAddress {
  if (parsed.address.includes('@') || parsed.address.includes(':')) return parsed;
  // A caller with no project root consults the personal catalog alone.
  const read = readHostsFile(managers.tab.launchDir ?? '', homedir(), (message) => {
    notify(managers, 'manual', originLabel, message);
  });
  return resolveSavedHost(parsed.address, read.hosts) ?? parsed;
}
