import {
  TAB_PLUGIN_API_VERSION,
  type TabPluginDeclaration,
} from '../api.js';
import { FIXTURE_PAYLOAD_SCHEMA_VERSION } from './shared.js';

export const fixtureV1Manifest = {
  id: 'fixture-v1',
  version: '1.0.0',
  apiVersion: TAB_PLUGIN_API_VERSION,
  payloadSchemaVersion: FIXTURE_PAYLOAD_SCHEMA_VERSION,
  tabLabelPrefix: 'fixture',
  fileExtensions: { '.janissary-plugin-v1': 'text/plain; charset=utf-8' },
  command: 'fixture-v1',
  capabilities: ['note', 'openOrFocusTab', 'rejectRequest', 'reportFailure'],
} as const satisfies TabPluginDeclaration;
