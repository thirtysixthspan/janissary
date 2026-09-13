// Plugin-domain wire types and RPCs, composed into the shared contract by ../protocol.ts.

export type PluginTabView = {
  id: string;
  schemaVersion: number;
  payload: unknown;
};

export type PluginIntentRequest = { tab: string; intent: string; payload: unknown };
export type PluginFailedRequest = { tab: string; reason: string };

// What a tab plugin contributes for a text selection, for the default context menu (see the
// `defaultMenuSelectionAction` RPC). Deliberately the label alone: the run RPC below carries the
// same label back, so the client can only ever ask for the entry it was just offered. `null` when
// no bundled plugin contributes one — or more than one does, since this surface has no owner tree
// to disambiguate by.
export type DefaultMenuEntry = { label: string };
export type DefaultMenuActionRequest = { selection: string };
export type DefaultMenuRunRequest = { selection: string; action: string };

export type PluginRpcCall =
  // What the default context menu should contribute for `selection`, if anything. Resolving never
  // activates a plugin — opening a menu is not a use of it.
  | { method: 'defaultMenuSelectionAction'; params: DefaultMenuActionRequest }
  // Run the entry the RPC above just offered. The server re-resolves the contributor, so the client
  // names nothing the server did not offer it. Fire-and-forget; the plugin's own tab is the result.
  | { method: 'runDefaultMenuSelectionAction'; params: DefaultMenuRunRequest }
  | { method: 'pluginIntent'; params: PluginIntentRequest }
  | { method: 'pluginFailed'; params: PluginFailedRequest };
