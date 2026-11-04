import { useCallback, useState } from 'react';
import type { ConnectionRow, LiveConnectionRow, RecordConnectionRow } from '@shared/plugins/connections/shared';
import type { TabPluginClientCapabilities } from '../api';

export function useConnectionsController(capabilities: TabPluginClientCapabilities) {
  const [pendingTerminate, setPendingTerminate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guarded = useCallback(async (action: () => Promise<unknown>): Promise<Error | null> => {
    setError(null);
    try {
      await action();
      return null;
    } catch (error_) {
      const failure = error_ instanceof Error ? error_ : new Error(String(error_));
      setError(failure.message);
      return failure;
    }
  }, []);

  const open = useCallback((row: ConnectionRow) => {
    void guarded(() => (row.type === 'record' && row.kind === 'agent'
      ? capabilities.intent('open-record', { id: row.id })
      : capabilities.intent('open', { kind: row.kind, id: row.id, ownerLabel: row.ownerLabel })));
  }, [capabilities, guarded]);

  const close = useCallback((row: LiveConnectionRow | RecordConnectionRow) => {
    void guarded(() => capabilities.intent('close', { kind: row.kind, id: row.id, ownerLabel: row.ownerLabel }));
  }, [capabilities, guarded]);

  const act = useCallback(async (name: 'cancel' | 'close-session' | 'terminate' | 'delete' | 'load-older', id: string) => {
    if (name === 'terminate') setPendingTerminate(true);
    const failure = await guarded(() => capabilities.intent(name, { id }));
    if (failure === null) return;
    if (name === 'terminate') setPendingTerminate(false);
    else if (name === 'load-older') throw failure;
  }, [capabilities, guarded]);

  const recordUpdated = useCallback((terminal: boolean) => {
    setError(null);
    if (terminal) setPendingTerminate(false);
  }, []);

  return {
    open, close, cancel: (id: string) => { void act('cancel', id); },
    closeSession: (id: string) => { void act('close-session', id); },
    terminate: (id: string) => { void act('terminate', id); },
    delete: (id: string) => { void act('delete', id); },
    loadOlder: (id: string) => act('load-older', id),
    pendingTerminate, error, recordUpdated,
  };
}
