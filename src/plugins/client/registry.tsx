import React from 'react';
import {
  TAB_PLUGIN_API_VERSION, TAB_PLUGIN_CLIENT_ACTIVATION_BUDGET_MS, type TabPluginClientActivation,
} from '../api';
import { withBudget } from '../budget';
import { failureReason } from '../failure';
import { pluginManifests } from '../manifests';
import { clientPluginLoaders } from './loaders';

type LazyProperties = React.ComponentProps<TabPluginClientActivation['component']>;
type Snapshot = { disabled: boolean; reason?: string };

const enabledSnapshot: Snapshot = { disabled: false };
const failures = new Map<string, Snapshot>();
const listeners = new Map<string, Set<() => void>>();

function apiCompatible(required: { major: number; minor: number }): boolean {
  return required.major === TAB_PLUGIN_API_VERSION.major && required.minor <= TAB_PLUGIN_API_VERSION.minor;
}

function lazyPlugin(pluginId: string) {
  return React.lazy(async () => {
    const manifest = pluginManifests.find((candidate) => candidate.id === pluginId);
    const loader = clientPluginLoaders[pluginId];
    if (!manifest || !loader) throw new Error('client behavior loader is missing');
    const load = async () => {
      const module = await loader();
      return module.activate();
    };
    const activation = await withBudget(load(), TAB_PLUGIN_CLIENT_ACTIVATION_BUDGET_MS, 'client activation');
    if (!apiCompatible(activation.apiVersion)) throw new Error('client activation returned an incompatible API version');
    if (activation.payloadSchemaVersion !== manifest.payloadSchemaVersion) {
      throw new Error('client activation returned a mismatched payload schema version');
    }
    if (typeof activation.validateTabPayload !== 'function') {
      throw new TypeError('client activation omitted its payload validator');
    }
    const Component = activation.component;
    return {
      default: (properties: LazyProperties) => {
        const valid: unknown = activation.validateTabPayload(properties.payload);
        if (valid !== true) throw new Error('plugin tab payload is invalid');
        return <Component {...properties} />;
      },
    };
  });
}

const lazyComponents = new Map(pluginManifests.map((manifest) => [manifest.id, lazyPlugin(manifest.id)]));

export function clientPluginComponent(pluginId: string) {
  return lazyComponents.get(pluginId);
}

export function clientPluginIds(): string[] {
  return Object.keys(clientPluginLoaders).toSorted((left, right) => left.localeCompare(right));
}

export function clientPluginSnapshot(pluginId: string): Snapshot {
  return failures.get(pluginId) ?? enabledSnapshot;
}

export function subscribeClientPlugin(pluginId: string, listener: () => void): () => void {
  const group = listeners.get(pluginId) ?? new Set<() => void>();
  group.add(listener);
  listeners.set(pluginId, group);
  return () => {
    group.delete(listener);
    if (group.size === 0) listeners.delete(pluginId);
  };
}

export function disableClientPlugin(pluginId: string, error: unknown): boolean {
  if (failures.has(pluginId)) return false;
  failures.set(pluginId, { disabled: true, reason: failureReason(error) });
  const pluginListeners = listeners.get(pluginId) ?? [];
  for (const listener of pluginListeners) listener();
  return true;
}

export function resetClientPluginFailures(): void {
  failures.clear();
}
