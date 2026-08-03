import React, { useEffect } from 'react';
// Type-only, so nothing from the catalog or any manifest reaches the browser bundle. It exists to
// make a client entry that is missing, misspelled, or left behind a compile error rather than a
// runtime "unknown client plugin" the first time somebody opens that plugin's tab.
import type { ProductionTabPluginId } from '@shared/plugins/catalog';
import type { TabPluginClientCapabilities } from './api';

export type ClientPluginProperties = {
  payload: unknown;
  capabilities: TabPluginClientCapabilities;
};

export type ClientPluginModule = {
  default: React.ComponentType<ClientPluginProperties>;
  isPayload(value: unknown): boolean;
};

type MountedProperties = ClientPluginProperties & { onMounted(): void };
export type ClientPluginRegistration = {
  schemaVersion: number;
  Component: React.LazyExoticComponent<React.ComponentType<MountedProperties>>;
};

export type ClientPluginLoader = () => Promise<ClientPluginModule>;

export const clientPluginLoaders = {
  video: () => import('./video/index'),
} satisfies Record<ProductionTabPluginId, ClientPluginLoader>;

function lazyPlugin(loader: ClientPluginLoader) {
  return React.lazy(async () => {
    const module = await loader();
    const Plugin = module.default;
    const ValidatedPlugin = ({ payload, capabilities, onMounted }: MountedProperties) => {
      useEffect(onMounted, [onMounted]);
      if (!module.isPayload(payload)) throw new Error('invalid plugin payload');
      return <Plugin payload={payload} capabilities={capabilities} />;
    };
    return { default: ValidatedPlugin };
  });
}

export function createClientPluginRegistry(
  entries: Record<string, { schemaVersion: number; loader: ClientPluginLoader }>,
): ReadonlyMap<string, ClientPluginRegistration> {
  return new Map(Object.entries(entries).map(([id, entry]) => [
    id,
    { schemaVersion: entry.schemaVersion, Component: lazyPlugin(entry.loader) },
  ]));
}

// Schema versions are literals rather than imports from a plugin's shared contract. Importing one
// here would pull that plugin's guards into the entry bundle — the eager cost the lazy chunk exists
// to avoid — because this module is reachable from the entry. `registry.test.tsx` pins every literal
// against its plugin's own constant, so the duplication cannot drift silently.
export const clientPluginRegistry = createClientPluginRegistry({
  video: { schemaVersion: 1, loader: clientPluginLoaders.video },
} satisfies Record<ProductionTabPluginId, { schemaVersion: number; loader: ClientPluginLoader }>);

const failures = new Map<string, string>();

export function clientPluginFailure(id: string): string | undefined {
  return failures.get(id);
}

export function disableClientPlugin(id: string, reason: string): boolean {
  if (failures.has(id)) return false;
  failures.set(id, reason);
  return true;
}

export function clearClientPluginFailures(): void {
  failures.clear();
}
