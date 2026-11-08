import { useEffect } from 'react';
import type { TabPluginClientCapabilities } from '../api';
import type { ShellReplyOutcome } from './useShellReplyWriters';

export function useBackgroundReplies(
  subscribe: TabPluginClientCapabilities['onBackgroundReply'],
  displayReply: (line: string, output: string, reply?: ShellReplyOutcome) => void,
  replyIds: Set<string>,
): void {
  useEffect(() => subscribe?.((reply) => {
    if (replyIds.has(reply.id)) return;
    replyIds.add(reply.id);
    displayReply(reply.line ?? 'monitor', reply.output, reply);
  }), [subscribe, displayReply, replyIds]);
}
