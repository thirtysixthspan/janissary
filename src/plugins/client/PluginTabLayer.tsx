import React, { Suspense, useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import type { TabView } from '@shared/protocol';
import { TAB_PLUGIN_API_VERSION, type TabPluginClientCapabilities } from '../api';
import { pluginFailureMessage } from '../failure';
import { pluginManifests } from '../manifests';
import { isPluginIntentReply } from '../validation';
import type { JanusClient } from '../../../web/src/ws';
import { SplitTabButton } from '../../../web/src/SplitTabButton';
import {
  clientPluginComponent, clientPluginSnapshot, disableClientPlugin, subscribeClientPlugin,
} from './registry';

class PluginErrorBoundary extends React.Component<{
  children: React.ReactNode;
  onError: (error: unknown) => void;
}, { error?: Error }> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error): void {
    this.props.onError(error);
  }

  render() {
    if (this.state.error) return null;
    return this.props.children;
  }
}

function resourceUrl(ref: string): string {
  const token = new URLSearchParams(location.search).get('token') ?? '';
  return `${ref}${ref.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
}

function preflightFailure(
  manifest: (typeof pluginManifests)[number] | undefined, schemaVersion: number,
): string | undefined {
  if (manifest === undefined) return 'plugin is not registered by this client';
  if (manifest.requiredApiVersion.major === TAB_PLUGIN_API_VERSION.major
    && manifest.requiredApiVersion.minor <= TAB_PLUGIN_API_VERSION.minor) {
    return schemaVersion === manifest.payloadSchemaVersion
      ? undefined
      : 'plugin tab payload schema version is incompatible';
  }
  return 'plugin requires an incompatible client API version';
}

export function PluginTabLayer({
  tab, client, onSplit,
}: { tab: TabView; client: JanusClient; onSplit?: () => void }) {
  const envelope = tab.plugin!;
  const pluginId = envelope.pluginId;
  const manifest = pluginManifests.find((candidate) => candidate.id === pluginId);
  // Memoized so the store is subscribed once per plugin rather than torn down and re-subscribed on
  // every render — this layer rerenders on each state broadcast.
  const subscribe = useCallback((listener: () => void) => subscribeClientPlugin(pluginId, listener), [pluginId]);
  const getSnapshot = useCallback(() => clientPluginSnapshot(pluginId), [pluginId]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const preflightError = preflightFailure(manifest, envelope.schemaVersion);
  const reportFailure = useCallback((error: unknown) => {
    if (disableClientPlugin(pluginId, error)) {
      client.send({
        method: 'pluginIntent',
        params: {
          tab: tab.label,
          schemaVersion: envelope.schemaVersion,
          intent: '$host/client-failure',
          payload: { reason: error instanceof Error ? error.message : String(error) },
        },
      });
    }
  }, [client, pluginId, envelope.schemaVersion, tab.label]);
  useEffect(() => { if (preflightError) reportFailure(preflightError); }, [preflightError, reportFailure]);
  const LazyComponent = clientPluginComponent(pluginId);
  const capabilities = useMemo<TabPluginClientCapabilities>(() => ({
    resourceUrl,
    pluginIntent: async (intent, payload) => {
      const reply: unknown = await client.request({
        method: 'pluginIntent',
        params: { tab: tab.label, schemaVersion: envelope.schemaVersion, intent, payload },
      });
      if (!isPluginIntentReply(reply) || reply.schemaVersion !== envelope.schemaVersion) {
        throw new Error('plugin intent returned an invalid reply');
      }
      return reply;
    },
    splitAction: onSplit ? <SplitTabButton onClick={onSplit} /> : null,
  }), [client, envelope.schemaVersion, onSplit, tab.label]);
  const reason = snapshot.reason ?? preflightError ?? (LazyComponent === undefined ? 'client behavior loader is missing' : undefined);
  if (reason || snapshot.disabled) {
    return <div className="plugin-failure">{pluginFailureMessage(pluginId, reason ?? 'unknown failure')}</div>;
  }
  if (LazyComponent === undefined) return null;
  return (
    <PluginErrorBoundary onError={reportFailure}>
      <Suspense fallback={<div className="plugin-loading">Loading tab plugin…</div>}>
        <LazyComponent payload={envelope.payload} capabilities={capabilities} />
      </Suspense>
    </PluginErrorBoundary>
  );
}
