import React, {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from '../shared/ws/ws';
import { AppCommandBarTabScope } from '../shared/command-bar/AppCommandBar';
import type { createPluginClientCapabilities, TabDirtyHandle } from './api';
import { usePluginHost } from './host';
import { type ClientPluginRegistration } from './registry';
import { usePluginRemote } from './usePluginRemote';
import { usePluginCapabilities } from './usePluginCapabilities';
import { AcpResponseScope } from '../shared/acp/AcpResponseScope';

const CLIENT_ACTIVATION_MS = 5000;

class PluginErrorBoundary extends Component<{
  children: React.ReactNode;
  onFailure(error: unknown): void;
}, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    this.props.onFailure(error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

// Reports one pre-mount failure (unknown id, schema mismatch) from an effect rather than during
// render. `reason` is a string and `fail` is stable, so this fires once instead of on every render.
function FailureEffect({ reason, fail }: { reason: string; fail(error: unknown): void }) {
  useEffect(() => { fail(reason); }, [fail, reason]);
  return null;
}

function PluginContent({
  id,
  registration,
  payload,
  agentRun,
  capabilities,
  onFailure,
}: {
  id: string;
  registration: ClientPluginRegistration;
  payload: unknown;
  agentRun?: TabView['agentRun'];
  capabilities: ReturnType<typeof createPluginClientCapabilities>;
  onFailure(error: unknown): void;
}) {
  const mounted = useRef(false);
  const onMounted = useCallback(() => { mounted.current = true; }, []);

  useEffect(() => {
    const signal = AbortSignal.timeout(CLIENT_ACTIVATION_MS);
    const timeout = () => {
      if (!mounted.current) onFailure(
        new Error(`client activation timed out after ${CLIENT_ACTIVATION_MS} ms`),
      );
    };
    signal.addEventListener('abort', timeout, { once: true });
    return () => { signal.removeEventListener('abort', timeout); };
  }, [onFailure]);

  const Plugin = registration.Component;
  return (
    <PluginErrorBoundary onFailure={onFailure}>
      <Suspense fallback={<div className="plugin-loading">Loading {id}…</div>}>
        <Plugin payload={payload} capabilities={capabilities} agentRun={agentRun} onMounted={onMounted} />
      </Suspense>
    </PluginErrorBoundary>
  );
}

function contentForPlugin(
  plugin: NonNullable<TabView['plugin']>,
  agentRun: TabView['agentRun'],
  registration: ClientPluginRegistration | undefined,
  capabilities: ReturnType<typeof createPluginClientCapabilities>,
  fail: (error: unknown) => void,
): React.ReactNode {
  if (registration === undefined) {
    return <FailureEffect reason={`unknown client plugin "${plugin.id}"`} fail={fail} />;
  }
  if (registration.schemaVersion !== plugin.schemaVersion) {
    return <FailureEffect
      reason={`payload schema ${plugin.schemaVersion} is not supported; expected ${registration.schemaVersion}`}
      fail={fail}
    />;
  }
  return (
    <PluginContent
      id={plugin.id}
      registration={registration}
      payload={plugin.payload}
      agentRun={agentRun}
      capabilities={capabilities}
      onFailure={fail}
    />
  );
}

// Everything inside one plugin tab's body. Split out of `PluginTabLayer` so `plugin` is required
// here: the layer already decides whether a tab carries an envelope, and duplicating that question
// inside every hook below left branches that no caller could ever reach.
export function PluginBody({
  plugin,
  label,
  client,
  active,
  dock = null,
  remote,
  acpResponse,
  agentRun,
  pendingQuestion,
  dotColor,
  onClose,
  onSplit,
  onDirtyHandle,
}: {
  plugin: NonNullable<TabView['plugin']>;
  label: string;
  client: JanusClient;
  active: boolean;
  dock?: 'left' | 'right' | null;
  remote?: TabView['remote'];
  acpResponse?: TabView['acpResponse'];
  agentRun?: TabView['agentRun'];
  pendingQuestion?: TabView['pendingQuestion'];
  dotColor?: string;
  onClose: (reason?: { terminalExited: string }) => void;
  onSplit?: () => void;
  onDirtyHandle?: (handle: TabDirtyHandle | null) => void;
}) {
  const host = usePluginHost();
  const remoteCapabilities = usePluginRemote(remote, client, label);
  const pluginId = plugin.id;
  const { capabilities, failed, fail } = usePluginCapabilities({
      host,
      pluginId,
      label,
      client,
      active,
      dock,
      onClose,
      onSplit,
      onDirtyHandle,
      claimedChords: plugin.chords,
      dotColor,
      recording: plugin.recording,
      transcript: plugin.transcript,
      remoteCapabilities,
  });

  if (failed || host.failure(pluginId) !== undefined) return null;
  // The command-bar state a body reaches is bound to this tab here, by the host, rather than by a label
  // the plugin passes: a plugin cannot then act on the bar, queue or focus of a tab it does not own.
  return (
    <AppCommandBarTabScope label={label} active={active}>
      <AcpResponseScope response={acpResponse} question={dock !== null && active ? pendingQuestion : undefined} label={label} client={client}>
        {contentForPlugin(plugin, agentRun, host.registry.get(pluginId), capabilities, fail)}
      </AcpResponseScope>
    </AppCommandBarTabScope>
  );
}
