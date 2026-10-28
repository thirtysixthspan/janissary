import { useCallback, useMemo, useRef, useState } from 'react';
import { errorText } from '@shared/error-text';
import { SplitTabButton } from '../shared/SplitTabButton';
import {
  createPluginClientCapabilities,
  type PluginClientCapabilityOptions,
  type TabDirtyHandle,
} from './api';

const NO_CHORDS: readonly string[] = [];

type PluginCapabilitiesOptions = Pick<
  PluginClientCapabilityOptions,
  | 'host'
  | 'pluginId'
  | 'label'
  | 'client'
  | 'active'
  | 'dock'
  | 'onClose'
  | 'onDirtyHandle'
  | 'claimedChords'
  | 'dotColor'
  | 'recording'
  | 'transcript'
  | 'remoteCapabilities'
> & {
  onSplit?: () => void;
};

export function usePluginCapabilities({
  host,
  pluginId,
  label,
  client,
  active,
  dock,
  onClose,
  onDirtyHandle,
  claimedChords: requestedChords,
  dotColor,
  recording,
  transcript,
  remoteCapabilities,
  onSplit,
}: PluginCapabilitiesOptions) {
  const [failed, setFailed] = useState(false);
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
  const close = useCallback((reason?: { terminalExited: string }) => { onCloseRef.current(reason); }, []);
  // Same ref treatment again: the handle registration must survive the capability object staying
  // stable, or a plugin would drop its dirty state every time the host rebuilt this callback.
  const onDirtyHandleRef = useRef(onDirtyHandle);
  onDirtyHandleRef.current = onDirtyHandle;
  const registerDirty = useCallback((handle: TabDirtyHandle | null) => {
    onDirtyHandleRef.current?.(handle);
  }, []);
  // The host accepted these chord ids from the tab's wire view. State broadcasts rebuild that view,
  // so keep the existing array while its joined form is unchanged.
  const claimedChords = requestedChords ?? NO_CHORDS;
  const chordsRef = useRef(claimedChords);
  if (chordsRef.current !== claimedChords && chordsRef.current.join(' ') !== claimedChords.join(' ')) {
    chordsRef.current = claimedChords;
  }
  const chords = chordsRef.current;
  const splitAction = useMemo(
    () => (splittable ? <SplitTabButton onClick={split} /> : null),
    [split, splittable],
  );
  const capabilities = useMemo(
    () => createPluginClientCapabilities({
      host,
      pluginId,
      label,
      client,
      active,
      dock,
      onClose: close,
      splitAction,
      onDirtyHandle: registerDirty,
      claimedChords: chords,
      dotColor,
      recording,
      transcript,
      remoteCapabilities,
    }),
    [active, client, close, dock, host, label, pluginId, registerDirty, splitAction, chords, dotColor,
      recording, transcript, remoteCapabilities],
  );
  const capabilitiesRef = useRef(capabilities);
  capabilitiesRef.current = capabilities;
  // `reportFailure` deduplicates per plugin id, so a second boundary failure sends nothing.
  const fail = useCallback((error: unknown) => {
    setFailed(true);
    capabilitiesRef.current.reportFailure(errorText(error));
  }, []);

  return { capabilities, failed, fail };
}
