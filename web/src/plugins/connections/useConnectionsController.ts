import { useCallback, useState } from 'react';
import type { ConnectionRow, LiveConnectionRow, RecordConnectionRow } from '@shared/plugins/connections/shared';
import type { TabPluginClientCapabilities } from '../api';

export function useConnectionsController(capabilities: TabPluginClientCapabilities) {
  const [pendingTerminate, setPendingTerminate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = useCallback((row: ConnectionRow) => {
    if (row.type === 'record' && row.kind === 'agent') {
      void capabilities.intent('open-record', { id: row.id });
      return;
    }
    void capabilities.intent('open', { kind: row.kind, id: row.id });
  }, [capabilities]);

  const close = useCallback((row: LiveConnectionRow | RecordConnectionRow) => {
    void capabilities.intent('close', { kind: row.kind, id: row.id });
  }, [capabilities]);

  const act = useCallback(async (name: 'cancel' | 'close-session' | 'terminate' | 'load-older', id: string) => {
    setError(null);
    if (name === 'terminate') setPendingTerminate(true);
    try {
      await capabilities.intent(name, { id });
    } catch (error_) {
      if (name === 'terminate') setPendingTerminate(false);
      setError(error_ instanceof Error ? error_.message : String(error_));
      if (name === 'load-older') throw error_;
    }
  }, [capabilities]);

  const recordUpdated = useCallback((terminal: boolean) => {
    setError(null);
    if (terminal) setPendingTerminate(false);
  }, []);

  return {
    open, close, cancel: (id: string) => { void act('cancel', id); },
    closeSession: (id: string) => { void act('close-session', id); },
    terminate: (id: string) => { void act('terminate', id); },
    loadOlder: (id: string) => act('load-older', id),
    pendingTerminate, error, recordUpdated,
  };
}
