import { useEffect, useRef } from 'react';
import { useCommandQueue } from '../api';
import type { TabPluginClientCapabilities } from '../api';
import { isShellQueuedCommand } from '@shared/plugins/shell/shared';
import { reportShellIntentFailure } from './report-shell-intent-failure';
import { createQueuedCommandAdapter } from './queued-command-adapter';

// Shell-specific transport and history adaptation for the core FIFO service.
export function useShellCommandQueue(
  capabilities: TabPluginClientCapabilities,
  run: (line: string, record?: boolean, receipt?: string) => Promise<boolean>,
  initiallyBusy: boolean,
  onQueued: (line: string) => void,
  queuedLines: readonly string[],
  terminalGeneration?: string,
) {
  const capabilitiesReference = useRef(capabilities);
  capabilitiesReference.current = capabilities;
  const runReference = useRef(run);
  runReference.current = run;
  const createAdapter = () => createQueuedCommandAdapter({
      dequeue: async () => {
        try {
          const command = await capabilitiesReference.current.intent<unknown>('dequeue-command', null);
          return isShellQueuedCommand(command) ? command : null;
        } catch (error: unknown) {
          reportShellIntentFailure(capabilitiesReference.current, 'shell dequeue intent failed', error);
          return null;
        }
      },
      discard: async (receipt) => {
        await capabilitiesReference.current.intent('dispatch-command', { receipt, discard: true });
      },
    }, (line, queued, receipt) => runReference.current(line, !queued, receipt));
  const adapterReference = useRef<ReturnType<typeof createQueuedCommandAdapter> | null>(null);
  adapterReference.current ??= createAdapter();
  const generationReference = useRef(terminalGeneration);
  useEffect(() => {
    if (generationReference.current === terminalGeneration) return;
    void adapterReference.current?.dispose();
    adapterReference.current = createAdapter();
    generationReference.current = terminalGeneration;
  }, [terminalGeneration]);
  useEffect(() => {
    adapterReference.current?.attach();
    return () => { void adapterReference.current?.dispose(); };
  }, [terminalGeneration]);
  return useCommandQueue({
    enqueue: async (line) => {
      try {
        await capabilities.intent<{ queued: boolean }>('queue', line);
      } catch (error: unknown) {
        reportShellIntentFailure(capabilities, 'shell queue intent failed', error);
      }
    },
    dequeue: () => adapterReference.current?.dequeue() ?? Promise.resolve(null),
  }, (line, queued) => adapterReference.current?.run(line, queued) ?? Promise.resolve(false), initiallyBusy, onQueued, queuedLines);
}
