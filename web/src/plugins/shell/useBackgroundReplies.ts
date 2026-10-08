import { useEffect, useRef } from 'react';
import type { TabPluginClientCapabilities } from '../api';

export function useBackgroundReplies(subscribe: TabPluginClientCapabilities['onBackgroundReply'], displayReply: (line: string, output: string) => void): void {
  const seen = useRef(new Set<string>());
  useEffect(() => subscribe?.((reply) => {
    if (seen.current.has(reply.id)) return;
    seen.current.add(reply.id);
    displayReply('monitor', reply.output);
  }), [subscribe, displayReply]);
}
