import { TAB_PLUGIN_API_VERSION, type TabPluginDeclaration } from '../api.js';

export const fixtureV1Manifest = {
  id: 'fixture-v1',
  version: '1.0.0',
  requiredApiVersion: TAB_PLUGIN_API_VERSION,
  payloadSchemaVersion: 1,
  tab: { labelPrefix: 'fixture' },
  commands: ['fixture-tab'],
  capabilities: ['transcript', 'plugin-tabs', 'served-files'],
} as const satisfies TabPluginDeclaration;
