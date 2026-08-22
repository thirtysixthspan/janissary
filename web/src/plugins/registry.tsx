import React, { useEffect } from 'react';
// Type-only, so nothing from the catalog or any manifest reaches the browser bundle. It exists to
// make a client entry that is missing, misspelled, or left behind a compile error rather than a
// runtime "unknown client plugin" the first time somebody opens that plugin's tab.
import type { ProductionTabPluginId } from '@shared/plugins/catalog';
import type { TabPluginClientCapabilities } from './api';

// `Payload` is the plugin's own payload type. A plugin entry states it once, through the return type
// of its `isPayload` guard, and gets a component typed in its own terms rather than one taking
// `unknown` and casting. The registry erases it again at `ClientPluginRegistration`, which is what
// lets one map hold plugins that disagree about what a payload is.
export type ClientPluginProperties<Payload = unknown> = {
  payload: Payload;
  capabilities: TabPluginClientCapabilities;
};

export type ClientPluginModule<Payload> = {
  default: React.ComponentType<ClientPluginProperties<Payload>>;
  isPayload(value: unknown): value is Payload;
};

type MountedProperties = ClientPluginProperties & { onMounted(): void };
export type ClientPluginRegistration = {
  schemaVersion: number;
  Component: React.LazyExoticComponent<React.ComponentType<MountedProperties>>;
};

export type ClientPluginLoader<Payload = unknown> = () => Promise<ClientPluginModule<Payload>>;

// Checked only for catalog parity, not payload type: a loader map entry is a bare import, and the
// payload each one resolves to is deliberately different per plugin.
export const clientPluginLoaders = {
  audio: () => import('./audio/index'),
  image: () => import('./image/index'),
  markdown: () => import('./markdown/index'),
  page: () => import('./page/index'),
  schedules: () => import('./schedules/index'),
  video: () => import('./video/index'),
} satisfies Record<ProductionTabPluginId, () => Promise<unknown>>;

// Wraps one plugin entry in the guard the host runs before any plugin behavior renders. The guard
// narrows `unknown` to that plugin's own payload type, so the component below receives it already
// validated and already typed — no plugin needs an unchecked assertion of its own.
export function clientPlugin<Payload>(
  schemaVersion: number,
  loader: ClientPluginLoader<Payload>,
): ClientPluginRegistration {
  const Component = React.lazy(async () => {
    const module = await loader();
    const Plugin = module.default;
    const ValidatedPlugin = ({ payload, capabilities, onMounted }: MountedProperties) => {
      useEffect(onMounted, [onMounted]);
      if (!module.isPayload(payload)) throw new Error('invalid plugin payload');
      return <Plugin payload={payload} capabilities={capabilities} />;
    };
    return { default: ValidatedPlugin };
  });
  return { schemaVersion, Component };
}

export function createClientPluginRegistry(
  entries: Record<string, ClientPluginRegistration>,
): ReadonlyMap<string, ClientPluginRegistration> {
  return new Map(Object.entries(entries));
}

// Schema versions are literals rather than imports from a plugin's shared contract. Importing one
// here would pull that plugin's guards into the entry bundle — the eager cost the lazy chunk exists
// to avoid — because this module is reachable from the entry. `registry.test.tsx` pins every literal
// against its plugin's own constant, so the duplication cannot drift silently.
export const clientPluginRegistry = createClientPluginRegistry({
  audio: clientPlugin(1, clientPluginLoaders.audio),
  image: clientPlugin(1, clientPluginLoaders.image),
  markdown: clientPlugin(1, clientPluginLoaders.markdown),
  page: clientPlugin(1, clientPluginLoaders.page),
  schedules: clientPlugin(1, clientPluginLoaders.schedules),
  video: clientPlugin(1, clientPluginLoaders.video),
} satisfies Record<ProductionTabPluginId, ClientPluginRegistration>);

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
