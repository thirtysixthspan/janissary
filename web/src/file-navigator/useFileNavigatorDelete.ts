import { useState } from 'react';
import type { JanusClient } from '../ws';

export function useFileNavigatorDelete(client: JanusClient, index: number) {
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
  const confirm = () => {
    if (pendingDelete?.length === 1) {
      client.send({ method: 'deleteFileNavigatorItem', params: { index, relPath: pendingDelete[0] } });
    } else if (pendingDelete && pendingDelete.length > 1) {
      client.send({ method: 'deleteFileNavigatorItems', params: { index, paths: pendingDelete } });
    }
    setPendingDelete(null);
  };
  return {
    pendingDelete,
    request: (paths: string[]) => {
      if (paths.length > 0) setPendingDelete(paths);
    },
    confirm,
    cancel: () => setPendingDelete(null),
  };
}
