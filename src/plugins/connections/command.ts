import type { TabPluginServerCapabilities } from '../api.js';
import { parseConnectionsCommand } from './parse.js';
import { openConnectionLookup } from './lookup.js';
import type { ConnectionTabs } from './tabs.js';

export function runConnectionsCommand(
  argument: string,
  name: string,
  tabs: ConnectionTabs,
  capabilities: TabPluginServerCapabilities,
): void {
  const parsed = parseConnectionsCommand(argument, name);
  if ('error' in parsed) {
    capabilities.note(parsed.error);
    return;
  }
  if (parsed.action === 'open-list') {
    tabs.openList(capabilities, false);
    return;
  }
  if (parsed.action === 'dock') {
    tabs.openList(capabilities, true);
    capabilities.dockTab('connections', parsed.side);
    return;
  }
  if (parsed.action === 'list') {
    const label = capabilities.originTab()?.label;
    if (!label) return capabilities.rejectRequest('No invoking tab for connections list.');
    const result = capabilities.topicAction({ topic: 'connections', action: 'list', label });
    capabilities.note(result ?? 'No open connections.');
    return;
  }
  if (parsed.action === 'close') {
    const label = capabilities.originTab()?.label;
    if (!label) return capabilities.rejectRequest('No invoking tab for connections close.');
    capabilities.topicAction({
      topic: 'connections', action: 'closeCommand', kind: parsed.kind, id: parsed.id, label,
    });
    return;
  }
  if (!openConnectionLookup(parsed.text, tabs, capabilities)) {
    capabilities.rejectRequest(`No connection matching "${parsed.text}".`);
  }
}
