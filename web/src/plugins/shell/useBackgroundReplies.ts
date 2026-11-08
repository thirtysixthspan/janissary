import { useEffect, useRef } from 'react';
import type { TabPluginClientCapabilities } from '../api';
import type { ShellReplyOutcome } from './useShellReplyWriters';

export function useBackgroundReplies(
  subscribe: TabPluginClientCapabilities['onBackgroundReply'],
  displayReply: (line: string, output: string, reply?: ShellReplyOutcome) => void,
): void {
  const seen = useRef(new Set<string>());
  useEffect(() => subscribe?.((reply) => {
    if (seen.current.has(reply.id)) return;
    seen.current.add(reply.id);
    displayReply(reply.line ?? 'monitor', reply.output, reply);
  }), [subscribe, displayReply]);
}
