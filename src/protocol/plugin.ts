// Plugin-domain wire types and RPCs, composed into the shared contract by ../protocol.ts.

export type PluginTabView = {
  id: string;
  schemaVersion: number;
  payload: unknown;
};

export type PluginIntentRequest = { tab: string; intent: string; payload: unknown };
export type PluginFailedRequest = { tab: string; reason: string };

export type PluginRpcCall =
  | { method: 'pluginIntent'; params: PluginIntentRequest }
  | { method: 'pluginFailed'; params: PluginFailedRequest };
