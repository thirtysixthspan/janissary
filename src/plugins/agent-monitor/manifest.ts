import { TAB_PLUGIN_API_VERSION, type TabPluginDeclaration } from '../api.js';

export const agentMonitorManifest = {
  id: 'agent-monitor',
  version: '1.0.0',
  apiVersion: TAB_PLUGIN_API_VERSION,
  payloadSchemaVersion: 1,
  tabLabelPrefix: 'agent-monitor',
  fileExtensions: {},
  agentMonitor: true,
  capabilities: ['rejectRequest', 'terminateAgentRun'],
} as const satisfies TabPluginDeclaration;
