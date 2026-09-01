import React, { createContext, useContext } from 'react';
import { clientPluginRegistry, type ClientPluginRegistration } from './registry';

// What the plugin frames need from the host: which plugins exist, which ones this run has already
// disabled, and the one call that disables one. The failure map belongs to the instance rather than
// to the module, so a caller can construct, substitute, or scope it — a test builds a fresh host per
// case instead of remembering to clear a global, and a forgotten reset cannot leak a disabled plugin
// into an unrelated case.
export type PluginHost = {
  registry: ReadonlyMap<string, ClientPluginRegistration>;
  failure(id: string): string | undefined;
  disable(id: string, reason: string): boolean;
};

// Defaults to the production registry so the app's host is built from the same map as before; tests
// pass their own so a fixture plugin never has to be written into the production one.
export function createPluginHost(
  registry: ReadonlyMap<string, ClientPluginRegistration> = clientPluginRegistry,
): PluginHost {
  const failures = new Map<string, string>();
  return {
    registry,
    failure: (id) => failures.get(id),
    // Returns false when this plugin is already disabled, which is what makes the report
    // deduplication in `createPluginClientCapabilities` a single check rather than a read and a write.
    disable: (id, reason) => {
      if (failures.has(id)) return false;
      failures.set(id, reason);
      return true;
    },
  };
}

const PluginHostContext = createContext<PluginHost | null>(null);

export function PluginHostProvider({ host, children }: { host: PluginHost; children: React.ReactNode }) {
  return <PluginHostContext.Provider value={host}>{children}</PluginHostContext.Provider>;
}

// Throws rather than falling back to a default instance: a fallback would be the module-level
// singleton this seam exists to remove, reachable by anything that forgot to mount the provider.
export function usePluginHost(): PluginHost {
  const host = useContext(PluginHostContext);
  if (host === null) throw new Error('no PluginHostProvider above this plugin');
  return host;
}
