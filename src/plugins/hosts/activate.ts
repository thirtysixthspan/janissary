import { homedir } from 'node:os';
import {
  defineIntents,
  noFileOpener,
  type TabPluginActivation,
  type TabPluginServerCapabilities,
} from '../api.js';
import { runCatalogCommand } from './catalog-commands.js';
import { readHostsFile, type HostsRead } from './hosts-file.js';
import { formatDestination, sameHostName, type SavedHost } from './hosts-values.js';
import {
  isHostsPayload, isOpenIntent, isRefreshIntent,
  type HostRow, type HostsPayload, type OpenIntent,
} from './shared.js';

const INSTANCE_KEY = 'hosts';
const TAB_TITLE = 'hosts';

type DispatchResult = Awaited<ReturnType<TabPluginServerCapabilities['dispatchLineWithOutput']>>;

function payloadFrom(hosts: readonly SavedHost[], filePath: string): HostsPayload {
  const rows: HostRow[] = hosts.map((host) => ({
    name: host.name,
    user: host.user ?? '',
    destination: formatDestination(host),
    path: host.path ?? '',
  }));
  return { filePath, rows };
}

function payloadOf(read: HostsRead): HostsPayload {
  return payloadFrom(read.hosts, read.path);
}

function publish(capabilities: TabPluginServerCapabilities, payload: HostsPayload): void {
  capabilities.updateTab(INSTANCE_KEY, () => ({ payload }));
}

function originRoot(capabilities: TabPluginServerCapabilities): string {
  const origin = capabilities.originTab();
  if (origin === null) return capabilities.rejectRequest('The Hosts tab has no origin.');
  return origin.root;
}

function readNotify(capabilities: TabPluginServerCapabilities, owned: boolean): (message: string) => void {
  return owned
    ? (message) => capabilities.notifyUser(message, { tab: INSTANCE_KEY })
    : (message) => capabilities.notifyUser(message);
}

function runCommand(argument: string, capabilities: TabPluginServerCapabilities): void {
  const root = originRoot(capabilities);
  const notify = readNotify(capabilities, false);
  const outcome = argument.trim().length === 0
    ? { kind: 'open' as const }
    : runCatalogCommand(argument, root, homedir(), notify);
  if (outcome.kind === 'open') {
    const read = readHostsFile(root, homedir(), notify);
    const payload = payloadOf(read);
    publish(capabilities, payload);
    capabilities.openOrFocusTab(INSTANCE_KEY, () => ({ title: TAB_TITLE, payload }));
    return;
  }
  if (outcome.kind === 'refusal') {
    capabilities.rejectRequest(outcome.reason);
    return;
  }
  if (outcome.kind === 'mutation') {
    publish(capabilities, payloadFrom(outcome.hosts, outcome.path));
  }
  capabilities.note(outcome.text);
}

function refresh(
  _tab: HostsPayload, _payload: Record<string, never>, capabilities: TabPluginServerCapabilities,
): null {
  const read = readHostsFile(originRoot(capabilities), homedir(), readNotify(capabilities, true));
  publish(capabilities, payloadOf(read));
  return null;
}

function dispatchMessage(name: string, result: DispatchResult): string | undefined {
  if (typeof result.result === 'string' && result.result.length > 0) return result.result;
  if (result.output.length > 0) return result.output;
  if (!result.dispatched) return `Could not open host "${name}".`;
  return undefined;
}

async function openRow(
  tab: HostsPayload, payload: OpenIntent, capabilities: TabPluginServerCapabilities,
): Promise<null> {
  const row = tab.rows.find((candidate) => sameHostName(candidate.name, payload.name));
  if (row === undefined) return capabilities.rejectRequest(`no host row "${payload.name}"`);
  const read = readHostsFile(originRoot(capabilities), homedir(), readNotify(capabilities, true));
  const host = read.hosts.find((candidate) => sameHostName(candidate.name, row.name));
  if (host === undefined) {
    publish(capabilities, payloadOf(read));
    capabilities.notifyUser(`No host named "${row.name}".`, { tab: INSTANCE_KEY });
    return null;
  }
  const result = await capabilities.dispatchLineWithOutput(`ssh ${host.name}`);
  const message = dispatchMessage(host.name, result);
  if (message !== undefined) capabilities.notifyUser(message, { tab: INSTANCE_KEY });
  return null;
}

export function activate(): TabPluginActivation {
  return {
    isPayload: isHostsPayload,
    opener: noFileOpener('hosts'),
    command: runCommand,
    intent: defineIntents('hosts', isHostsPayload, {
      refresh: { payload: isRefreshIntent, run: refresh },
      open: { payload: isOpenIntent, run: openRow },
    }),
  };
}
