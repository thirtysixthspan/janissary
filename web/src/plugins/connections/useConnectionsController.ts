import { useCallback } from 'react';
import type { ConnectionRow, LiveConnectionRow, RecordConnectionRow } from '@shared/plugins/connections/shared';
import type { TabPluginClientCapabilities } from '../api';

export function useConnectionsController(capabilities: TabPluginClientCapabilities) {
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

  return { open, close };
}
