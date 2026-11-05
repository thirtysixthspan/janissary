import type { TabPluginDeclaration } from '../api.js';
import { FIXTURE_PAYLOAD_SCHEMA_VERSION } from './shared.js';

export const fixtureV2Manifest = {
  id: 'fixture-v2',
  version: '1.0.0',
  apiVersion: 2,
  payloadSchemaVersion: FIXTURE_PAYLOAD_SCHEMA_VERSION,
  tabLabelPrefix: 'fixture',
  fileExtensions: { '.janissary-plugin-v2': 'text/plain; charset=utf-8' },
  command: 'fixture-v2',
  capabilities: ['note', 'openOrFocusTab', 'rejectRequest', 'reportFailure'],
} as const satisfies TabPluginDeclaration;
