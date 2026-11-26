import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import type { TabPluginServerCapabilities } from '../api.js';
import type { CatalogParse } from './catalog-commands.js';
import { exportSshHosts } from './export-ssh.js';
import { readHostsFile, type HostsRead } from './hosts-file.js';
import { importSshHosts } from './import-ssh.js';
import { resolveSshConfigTarget } from './ssh-config-target.js';

export type SshIntentVariant = Extract<CatalogParse, { kind: 'import' | 'export' }>;
export type SshIntentMode = 'command' | 'intent';
export type SshIntentNotify = (message: string) => void;
export type PublishHosts = (read: HostsRead) => void;

const REMOTE_REFUSAL = 'hosts import and hosts export work only in local tabs.';
const DEFAULT_DISPLAY = '~/.ssh/config';

type Target = { path: string; display: string };

function targetOf(variant: SshIntentVariant, root: string, cwd: string): Target {
  if (variant.operand === '') {
    return { path: path.join(homedir(), '.ssh', 'config'), display: DEFAULT_DISPLAY };
  }
  return resolveSshConfigTarget(
    root, homedir(), path.join(root, '.janissary', 'workspace'), cwd, variant.operand,
  );
}

function realPath(filePath: string): string {
  try {
    return realpathSync(filePath);
  } catch {
    return path.resolve(filePath);
  }
}

function isCatalogPath(targetPath: string, root: string, home: string): boolean {
  const resolved = realPath(targetPath);
  return [
    path.join(root, '.janissary', 'hosts.json'),
    path.join(home, '.janissary', 'hosts.json'),
  ].some((catalog) => realPath(catalog) === resolved);
}

function catalogRefusal(kind: SshIntentVariant['kind'], display: string): string {
  const role = kind === 'export' ? 'an export target' : 'an import source';
  return `Cannot ${kind} hosts: ${display} is the hosts catalog and cannot be ${role}.`;
}

function report(
  mode: SshIntentMode,
  capabilities: TabPluginServerCapabilities,
  notify: SshIntentNotify,
  text: string,
  refusal: boolean,
): void {
  if (mode === 'command') {
    if (refusal) return capabilities.rejectRequest(text);
    capabilities.note(text);
    return;
  }
  notify(text);
}

export function runSshIntent(
  variant: SshIntentVariant,
  capabilities: TabPluginServerCapabilities,
  notify: SshIntentNotify,
  publish: PublishHosts,
  mode: SshIntentMode,
): void {
  const origin = capabilities.originTab();
  if (origin?.remote === true) {
    report(mode, capabilities, notify, REMOTE_REFUSAL, true);
    return;
  }
  const root = origin?.root ?? '';
  const cwd = origin?.cwd ?? '';
  const home = homedir();
  const target = targetOf(variant, root, cwd);
  if (isCatalogPath(target.path, root, home)) {
    report(mode, capabilities, notify, catalogRefusal(variant.kind, target.display), true);
    return;
  }
  if (variant.kind === 'import') {
    const outcome = importSshHosts(root, home, target.path, target.display);
    if (!outcome.ok) {
      report(mode, capabilities, notify, outcome.error, true);
      return;
    }
    if (outcome.imported > 0) publish(readHostsFile(root, home, notify));
    report(mode, capabilities, notify, outcome.summary, false);
    return;
  }
  const outcome = exportSshHosts(root, home, target.path, target.display, notify);
  report(mode, capabilities, notify, outcome.ok ? outcome.report : outcome.error, !outcome.ok);
}
