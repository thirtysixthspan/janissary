import { useState } from 'react';
import type { JanusClient } from './ws';

export function useFileNavigatorDelete(client: JanusClient, index: number) {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const confirm = () => {
    if (pendingDelete) client.send({ method: 'deleteFileTreeItem', params: { index, relPath: pendingDelete } });
    setPendingDelete(null);
  };
  return {
    pendingDelete,
    request: setPendingDelete,
    confirm,
    cancel: () => setPendingDelete(null),
  };
}
