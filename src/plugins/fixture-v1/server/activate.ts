import { TAB_PLUGIN_API_VERSION, type TabPluginServerCapabilities } from '../../api.js';
import { fixtureV1Manifest } from '../manifest.js';
import { isFixtureV1Intent, isFixtureV1Payload, isFixtureV1Reply } from '../shared.js';

export function activate(capabilities: TabPluginServerCapabilities) {
  return {
    apiVersion: TAB_PLUGIN_API_VERSION,
    payloadSchemaVersion: fixtureV1Manifest.payloadSchemaVersion,
    validateTabPayload: isFixtureV1Payload,
    commands: {
      'fixture-tab': (_command: string, context: { originLabel: string }) => {
        capabilities.openPluginTab({
          originLabel: context.originLabel,
          instanceKey: 'fixture-v1',
          title: 'fixture',
          create: ({ registerFile }) => ({
            message: 'fixture v1',
            resource: registerFile('/tmp/janissary-fixture-v1.txt'),
          }),
        });
      },
    },
    validateIntent: isFixtureV1Intent,
    handleIntent: (request: { intent: string; payload: unknown }) => ({
      schemaVersion: fixtureV1Manifest.payloadSchemaVersion,
      payload: request.payload,
    }),
    validateIntentReply: isFixtureV1Reply,
  };
}
