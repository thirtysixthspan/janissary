import type { PluginIntentReply, PluginIntentRequest } from '../protocol.js';
import type { Managers } from '../managers.js';

export type PluginControllerAdapter = {
  pluginIntent(request: PluginIntentRequest): Promise<PluginIntentReply>;
};

export function createPluginControllerAdapter(managers: Managers): PluginControllerAdapter {
  return {
    pluginIntent: (request) => managers.plugins.pluginIntent(request),
  };
}
