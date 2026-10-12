import { noFileOpener, TabPluginRejection, type TabPluginActivation } from '../api.js';
import { isAgentMonitorPayload } from './shared.js';

export function activate(): TabPluginActivation {
  return {
    opener: noFileOpener('agent-monitor'),
    isPayload: isAgentMonitorPayload,
    intent: async (request, capabilities) => {
      if (!isAgentMonitorPayload(request.tabPayload)) throw new Error('invalid monitor payload');
      if (request.intent !== 'terminate') throw new TabPluginRejection(`unknown intent "${request.intent}"`);
      if (request.payload !== null && (typeof request.payload !== 'object' || Array.isArray(request.payload))) {
        throw new TabPluginRejection('invalid terminate request');
      }
      await capabilities.terminateAgentRun();
      return null;
    },
  };
}
