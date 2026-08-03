import type { TabPluginActivation } from '../api.js';
import {
  isFixtureIntentPayload,
  isFixturePayload,
  type FixtureIntentResult,
} from './shared.js';

export function activate(): TabPluginActivation {
  return {
    isPayload: isFixturePayload,
    opener: {
      inline: (file, capabilities) => {
        capabilities.openOrFocusTab(file, (resources) => ({
          title: 'fixture',
          payload: {
            text: file,
            resource: resources.registerFile(file),
          },
        }));
      },
      external: (file, capabilities) => {
        capabilities.note(`Fixture external: ${file}`);
      },
    },
    command: (argument, capabilities) => {
      if (!argument) return capabilities.rejectRequest('Usage: fixture-v1 <text>');
      capabilities.note(`Fixture command: ${argument}`);
    },
    intent: (request, capabilities) => {
      const payload = request.payload;
      if (request.intent === 'echo' && isFixtureIntentPayload(payload)) {
        const result: FixtureIntentResult = { echoed: payload.value };
        return result;
      }
      // Both halves of the v1 failure contract stay frozen here: a bad request is answered and the
      // plugin keeps running, while `break` is the only route across the failure boundary.
      if (request.intent === 'break') return capabilities.reportFailure('fixture broke on purpose');
      return capabilities.rejectRequest(`invalid fixture intent "${request.intent}"`);
    },
    dispose: () => {},
  };
}

export { FIXTURE_PAYLOAD_SCHEMA_VERSION } from './shared.js';
