import { useEffect } from 'react';
import type { TabPluginClientCapabilities } from '../api';
import type { ShellReplyOutcome } from './useShellReplyWriters';

type PendingNameReceiver = Parameters<NonNullable<TabPluginClientCapabilities['onPendingAcpReplyName']>>[0];
type PendingNameUpdate = Parameters<PendingNameReceiver>[0];

export function useBackgroundReplies(
  subscribe: TabPluginClientCapabilities['onBackgroundReply'],
  displayReply: (line: string, output: string, reply?: ShellReplyOutcome) => void,
  replyIds: Set<string>,
  subscribePendingName?: TabPluginClientCapabilities['onPendingAcpReplyName'],
): void {
  useEffect(() => subscribe?.((reply) => {
    if (replyIds.has(reply.id)) return;
    replyIds.add(reply.id);
    displayReply(reply.line ?? 'monitor', reply.output, reply);
  }), [subscribe, displayReply, replyIds]);
  useEffect(() => subscribePendingName?.((update: PendingNameUpdate) => {
    if (replyIds.has(update.id)) return;
    displayReply('', '', { ...update, pending: true });
  }), [subscribePendingName, displayReply, replyIds]);
}
