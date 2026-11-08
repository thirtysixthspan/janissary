import type { TabPluginClientCapabilities } from '../api';
import type { ShellReplyOutcome } from './useShellReplyWriters';
import { useBackgroundReplies } from './useBackgroundReplies';

type Properties = {
  capabilities: Pick<TabPluginClientCapabilities, 'onBackgroundReply' | 'onPendingAcpReplyName'>;
  displayReply: (line: string, output: string, reply?: ShellReplyOutcome) => void;
  replyIds: Set<string>;
};

export function ShellBackgroundReplies({ capabilities, displayReply, replyIds }: Properties): null {
  useBackgroundReplies(
    capabilities.onBackgroundReply, displayReply, replyIds, capabilities.onPendingAcpReplyName,
  );
  return null;
}
