import type { HostsNotify } from './hosts-file.js';
import { readHostsFile } from './hosts-file.js';
import type { SavedHost } from './hosts-values.js';
import { sameHostName } from './hosts-values.js';
import { readSshConfigFile, writeSshConfigFile } from './ssh-config-file.js';
import { findManagedSections, serializeManagedSection, spliceManagedSection } from './ssh-config/section.js';

export type ExportSshHostsOutcome =
  | { ok: false; error: string }
  | { ok: true; report: string };

function exportSummary(displayPath: string, exported: number, skipped: number): string {
  const skippedPart = skipped === 0 ? '' : `; skipped ${skipped}`;
  if (exported === 0) return `No hosts to export${skippedPart}.`;
  const noun = exported === 1 ? 'host' : 'hosts';
  return `Exported ${exported} ${noun} to ${displayPath}${skippedPart}.`;
}

function exportedHosts(catalog: readonly SavedHost[], outsideAliases: readonly string[]): SavedHost[] {
  return catalog.filter((host) => outsideAliases.every((alias) => !sameHostName(host.name, alias)));
}

export function exportSshHosts(
  root: string,
  home: string,
  targetPath: string,
  displayPath: string,
  notify: HostsNotify,
): ExportSshHostsOutcome {
  const catalog = readHostsFile(root, home, notify);
  if (!catalog.usable) {
    return { ok: false, error: `Cannot export hosts: ${catalog.path} is unusable — fix it by hand.` };
  }
  const read = readSshConfigFile(targetPath);
  const found = findManagedSections(read.text);
  if (catalog.hosts.length === 0 && found.ranges.length === 0) {
    return { ok: true, report: 'No hosts to export.' };
  }
  const included = exportedHosts(catalog.hosts, found.outsideAliases);
  const skipped = catalog.hosts.length - included.length;
  const section = serializeManagedSection(included);
  const nextText = spliceManagedSection(read.text, found.ranges, section);
  const written = writeSshConfigFile(targetPath, nextText);
  if (written.problem !== undefined) {
    return { ok: false, error: `Could not write ssh config ${displayPath}: ${written.problem}.` };
  }
  return { ok: true, report: exportSummary(displayPath, included.length, skipped) };
}
