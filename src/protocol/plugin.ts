// Plugin-domain wire types and RPCs, composed into the shared contract by ../protocol.ts.

export type PluginTabView = {
  id: string;
  schemaVersion: number;
  payload: unknown;
  // The chords this plugin claimed in its declaration, carried with the tab rather than looked up on
  // the client: the claim is server-side data, and a client that kept its own copy would be a second
  // place for it to drift from the declaration that is actually enforced at activation.
  chords?: readonly string[];
  // Present when this plugin's declaration says its tabs host the application command bar, so the
  // client opens its shared pickers and queue popup over the tab without knowing which plugin it is.
  hostsCommandBar?: true;
  // This tab's asciicast recording, mirrored from the server's own record of it. Present only for a
  // plugin whose declaration asked for `recordsTerminal`, and only once the tab's terminal has
  // produced output — a recording exists from the first byte, not from the spawn.
  recording?: string;
  // This tab's plain-text transcript, mirrored from the server's own record of it. Present only for a
  // plugin whose declaration asked for `recordsTerminal` while `recordShellTabs` is on, and only once
  // the transcript file has opened on the terminal's first output.
  transcript?: string;
};

export type PluginIntentRequest = { tab: string; intent: string; payload: unknown };
export type PluginFailedRequest = { tab: string; reason: string };

// One entry a tab plugin contributes for a text selection, for the default context menu (see the
// `defaultMenuSelectionAction` RPC, which answers them in menu order). Deliberately the label alone:
// the run RPC below carries the same label back, so the client can only ever ask for an entry it was
// just offered. `shortcut` marks the one entry Cmd+I runs without opening the menu.
export type DefaultMenuEntry = { label: string; shortcut?: true };
export type DefaultMenuActionRequest = { selection: string };
export type DefaultMenuRunRequest = {
  selection: string;
  action: string;
  // The tab whose body the selection is in; absent from older clients, which fall back to the
  // active tab.
  tab?: string;
};

export type PluginRpcCall =
  // The entries the default context menu should contribute for `selection`, in order — empty when
  // none. Resolving never activates a plugin — opening a menu is not a use of it.
  | { method: 'defaultMenuSelectionAction'; params: DefaultMenuActionRequest }
  // Run the entry the RPC above just offered. The server re-resolves the contributor, so the client
  // names nothing the server did not offer it. Fire-and-forget; the plugin's own tab is the result.
  | { method: 'runDefaultMenuSelectionAction'; params: DefaultMenuRunRequest }
  | { method: 'pluginIntent'; params: PluginIntentRequest }
  | { method: 'pluginFailed'; params: PluginFailedRequest };
