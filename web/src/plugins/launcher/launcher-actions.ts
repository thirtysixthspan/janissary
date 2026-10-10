import type { TabPluginClientCapabilities } from '../api';
import type { LauncherCommand, LauncherDispatchReply } from '@shared/plugins/launcher/shared';

function shownFor(reply: LauncherDispatchReply | null, line: string): string | null {
  if (reply === null || !reply.dispatched) return `No application command matches "${line}".`;
  if (reply.coreResponse || !reply.output) return null;
  return reply.output;
}

function rejectedFor(error: unknown, line: string): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `Could not run "${line}": ${detail}`;
}

export function createLauncherActions(
  capabilities: TabPluginClientCapabilities,
  onReply: (text: string | null) => void,
) {
  const request = (intent: string, payload: unknown, line: string): void => {
    void capabilities.intent<LauncherDispatchReply | null>(intent, payload)
      .then((reply) => { onReply(shownFor(reply, line)); })
      .catch((error: unknown) => { onReply(rejectedFor(error, line)); });
  };

  return {
    command: (entry: LauncherCommand): void => { request('run-command', { id: entry.id }, entry.command); },
    configure: (filePath: string): void => { request('configure', { id: 'configure' }, `edit ${filePath}`); },
  };
}
