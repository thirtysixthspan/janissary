import { useCommandQueue } from '../api';
import type { TabPluginClientCapabilities } from '../api';
import type { ShellQueuedLine } from '@shared/plugins/shell/shared';
import { reportShellIntentFailure } from './report-shell-intent-failure';

// Shell-specific transport and history adaptation for the core FIFO service.
export function useShellCommandQueue(
  capabilities: TabPluginClientCapabilities,
  run: (line: string, record?: boolean) => Promise<boolean>,
  initiallyBusy: boolean,
  onQueued: (line: string) => void,
  queuedLines: readonly string[],
) {
  return useCommandQueue({
    enqueue: async (line) => {
      try {
        await capabilities.intent<{ queued: boolean }>('queue', line);
      } catch (error: unknown) {
        reportShellIntentFailure(capabilities, 'shell queue intent failed', error);
      }
    },
    dequeue: async () => {
      try {
        const result = await capabilities.intent<ShellQueuedLine>('dequeue', null);
        return typeof result.line === 'string' ? result.line : null;
      } catch (error: unknown) {
        reportShellIntentFailure(capabilities, 'shell dequeue intent failed', error);
        return null;
      }
    },
  }, (line, queued) => run(line, !queued), initiallyBusy, onQueued, queuedLines);
}
