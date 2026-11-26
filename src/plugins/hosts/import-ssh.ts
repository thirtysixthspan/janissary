import { mutateHostsFile } from './hosts-file.js';
import type { SavedHost } from './hosts-values.js';
import { formatDestination, sameHostName, validateHostFields } from './hosts-values.js';
import { readSshConfigFile } from './ssh-config-file.js';
import type { EffectiveAlias } from './ssh-config/parse.js';
import { readEffectiveAliases } from './ssh-config/parse.js';

export type ImportSshHostsOutcome =
  | { ok: false; error: string }
  | { ok: true; hosts: SavedHost[]; imported: number; skipped: number; summary: string };

type ImportCounts = { hosts: SavedHost[]; imported: number; skipped: number };

function acceptedHost(alias: EffectiveAlias, catalog: readonly SavedHost[]): SavedHost | undefined {
  if (alias.invalidToken !== '') return undefined;
  if (catalog.some((host) => sameHostName(host.name, alias.name))) return undefined;
  const hostName = alias.hostName === '' ? alias.name : alias.hostName;
  const destination = formatDestination(
    alias.port === ''
      ? { name: alias.name, host: hostName }
      : { name: alias.name, host: hostName, port: Number(alias.port) },
  );
  const validated = validateHostFields(
    alias.name,
    alias.user === '' ? undefined : alias.user,
    destination,
    undefined,
  );
  return validated.ok ? validated.host : undefined;
}

function importSummary(displayPath: string, imported: number, skipped: number): string {
  const skippedPart = skipped === 0 ? '' : `; skipped ${skipped}`;
  if (imported === 0) return `No aliases to import from ${displayPath}${skippedPart}.`;
  const noun = imported === 1 ? 'host' : 'hosts';
  return `Imported ${imported} ${noun} from ${displayPath}${skippedPart}.`;
}

export function importSshHosts(
  root: string,
  home: string,
  sourcePath: string,
  displayPath: string,
): ImportSshHostsOutcome {
  const read = readSshConfigFile(sourcePath);
  if (read.problem !== undefined) {
    return { ok: false, error: `Cannot read ssh config ${displayPath}: ${read.problem}.` };
  }
  const aliases = readEffectiveAliases(read.text);
  let counts: ImportCounts | undefined;
  const mutation = mutateHostsFile(root, home, undefined, (hosts) => {
    const catalog = [...hosts];
    let skipped = 0;
    for (const alias of aliases) {
      const host = acceptedHost(alias, catalog);
      if (host === undefined) skipped++;
      else catalog.push(host);
    }
    counts = { hosts: catalog, imported: catalog.length - hosts.length, skipped };
    if (counts.imported === 0) return { ok: false, error: '' };
    return { ok: true, hosts: catalog, result: undefined };
  });
  const imported = counts?.imported ?? 0;
  const skipped = counts?.skipped ?? 0;
  const summary = importSummary(displayPath, imported, skipped);
  if (!mutation.ok) {
    if (counts !== undefined && imported === 0) {
      return { ok: true, hosts: counts.hosts, imported, skipped, summary };
    }
    return { ok: false, error: mutation.error };
  }
  return { ok: true, hosts: mutation.hosts, imported, skipped, summary };
}
