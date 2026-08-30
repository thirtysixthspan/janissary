import React, {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { TabView } from '@shared/protocol';
import { errorText } from '@shared/error-text';
import type { JanusClient } from '../ws';
import { SplitTabButton } from '../SplitTabButton';
import { createPluginClientCapabilities, type TabDirtyHandle } from './api';
import { clientPluginFailure, clientPluginRegistry, type ClientPluginRegistration } from './registry';

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
  capabilities,
  onFailure,
}: {
  id: string;
  registration: ClientPluginRegistration;
  payload: unknown;
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
        <Plugin payload={payload} capabilities={capabilities} onMounted={onMounted} />
      </Suspense>
    </PluginErrorBoundary>
  );
}

function contentForPlugin(
  plugin: NonNullable<TabView['plugin']>,
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
  onClose,
  onSplit,
  onDirtyHandle,
}: {
  plugin: NonNullable<TabView['plugin']>;
  label: string;
  client: JanusClient;
  active: boolean;
  dock?: 'left' | 'right' | null;
  onClose: () => void;
  onSplit?: () => void;
  onDirtyHandle?: (handle: TabDirtyHandle | null) => void;
}) {
  const [failed, setFailed] = useState(false);
  const pluginId = plugin.id;
  // The caller rebuilds `onSplit` on every render, so calling through a ref is what actually keeps
  // the capability object stable — memoizing on `onSplit` itself would rebuild it every time.
  const onSplitRef = useRef(onSplit);
  onSplitRef.current = onSplit;
  const splittable = onSplit !== undefined;
  const split = useCallback(() => { onSplitRef.current?.(); }, []);
  // Same ref treatment as `onSplit`, and for the same reason: the caller closes over a tab index
  // that changes, so calling through a ref is what keeps the capability object stable.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const close = useCallback(() => { onCloseRef.current(); }, []);
  // Same ref treatment again: the handle registration must survive the capability object staying
  // stable, or a plugin would drop its dirty state every time the host rebuilt this callback.
  const onDirtyHandleRef = useRef(onDirtyHandle);
  onDirtyHandleRef.current = onDirtyHandle;
  const registerDirty = useCallback((handle: TabDirtyHandle | null) => {
    onDirtyHandleRef.current?.(handle);
  }, []);
  // The host builds the control and the capability object only carries it, so the plugin contract
  // never has to import a component. Memoized on the same two stable values the capability object
  // is, or a fresh element every render would churn it underneath a mounted plugin.
  const splitAction = useMemo(
    () => (splittable ? <SplitTabButton onClick={split} /> : null),
    [split, splittable],
  );
  const capabilities = useMemo(
    () => createPluginClientCapabilities(
      pluginId, label, client, active, dock, close, splitAction, registerDirty,
    ),
    [active, client, close, dock, label, pluginId, registerDirty, splitAction],
  );
  const capabilitiesRef = useRef(capabilities);
  capabilitiesRef.current = capabilities;
  // `reportFailure` deduplicates per plugin id, so a second boundary failure sends nothing.
  const fail = useCallback((error: unknown) => {
    setFailed(true);
    capabilitiesRef.current.reportFailure(errorText(error));
  }, []);

  if (failed || clientPluginFailure(pluginId) !== undefined) return null;
  return contentForPlugin(plugin, clientPluginRegistry.get(pluginId), capabilities, fail);
}
