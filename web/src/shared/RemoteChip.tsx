import React from 'react';
import type { RemoteTarget } from '@shared/protocol';

export function RemoteChip({ remote }: { remote: RemoteTarget }) {
  return (
    <span className="tab-meta-chip tab-remote-chip" aria-label="Remote" title={`Remote: ${remote.address}`}>
      {remote.host}
    </span>
  );
}
