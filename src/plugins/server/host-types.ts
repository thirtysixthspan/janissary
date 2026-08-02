import type { TabPluginActivation, TabPluginDeclaration, TabPluginServerLoader } from '../api.js';

// One catalogued plugin's whole server-side state. `reason` doubles as the disabled marker: once it
// is set the host never imports, activates, or calls that plugin again for the rest of the process.
export type PluginEntry = {
  declaration: TabPluginDeclaration;
  loader?: TabPluginServerLoader;
  activation?: TabPluginActivation;
  activationPromise?: Promise<void>;
  reason?: string;
  activationMs?: number;
};

export type PluginStatus = {
  state: 'inactive' | 'activating' | 'active' | 'disabled' | 'unknown';
  activationMs?: number;
  reason?: string;
};

export type PluginHostOptions = {
  declarations?: readonly TabPluginDeclaration[];
  loaders?: Readonly<Record<string, TabPluginServerLoader>>;
  activationBudgetMs?: number;
  handlerBudgetMs?: number;
  now?: () => number;
};
