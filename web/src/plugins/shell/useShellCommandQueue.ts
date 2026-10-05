import { useCallback, useEffect, useRef, useState } from 'react';
import type { TabPluginClientCapabilities } from '../api';
import type { ShellQueuedLine } from '@shared/plugins/shell/shared';
import { ShellCommandQueue } from './shell-command-queue';

// Owns this tab's `ShellCommandQueue`. The capabilities and the runner are read through refs because
// both are rebuilt on renders that change nothing about the queue, and a new instance would forget
// that a drain was already under way.
// The returned `submit` is what the bar calls: it queues the line while zsh is busy, recording it in
// the bar's history through `onQueued` as it would have been had it run, and runs it otherwise.
export function useShellCommandQueue(
  capabilities: TabPluginClientCapabilities,
  run: (line: string, record?: boolean) => Promise<boolean>,
  initiallyBusy: boolean,
  onQueued: (line: string) => void,
  queuedLines: readonly string[],
): { queue: ShellCommandQueue; submit: (line: string) => void } {
  const capabilitiesReference = useRef(capabilities);
  capabilitiesReference.current = capabilities;
  const runReference = useRef(run);
  runReference.current = run;
  const [queue] = useState(() => new ShellCommandQueue({
    enqueue: async (line) => {
      try {
        await capabilitiesReference.current.intent<{ queued: boolean }>('queue', line);
      } catch {
        capabilitiesReference.current.reportFailure('shell queue intent failed');
      }
    },
    // `null` rather than `undefined` for the same reason the status question sends it: a key whose
    // value is `undefined` does not survive the wire, and the host refuses an intent without one.
    dequeue: async () => {
      try {
        const result = await capabilitiesReference.current.intent<ShellQueuedLine>('dequeue', null);
        return typeof result.line === 'string' ? result.line : null;
      } catch {
        capabilitiesReference.current.reportFailure('shell dequeue intent failed');
        return null;
      }
    },
  }, (line) => runReference.current(line, false), initiallyBusy));
  useEffect(() => {
    queue.attach();
    return () => { queue.dispose(); };
  }, [queue]);
  useEffect(() => {
    if (queuedLines.length > 0) queue.wake();
  }, [queue, queuedLines]);
  const onQueuedReference = useRef(onQueued);
  onQueuedReference.current = onQueued;
  const submit = useCallback((line: string) => {
    if (queue.submit(line)) {
      onQueuedReference.current(line);
      return;
    }
    void runReference.current(line);
  }, [queue]);
  return { queue, submit };
}
