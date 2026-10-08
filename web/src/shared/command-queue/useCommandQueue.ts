import { useCallback, useEffect, useRef, useState } from 'react';
import { CommandQueue, type QueueTransport, type QueuedLineRunner } from './command-queue';

// Keeps one drain alive across renders; tab-specific routing and transport arrive as callbacks.
export function useCommandQueue(
  transport: QueueTransport,
  run: QueuedLineRunner,
  initiallyBusy: boolean,
  onQueued: (line: string) => void,
  queuedLines: readonly string[],
): { queue: CommandQueue; submit: (line: string) => void } {
  const transportReference = useRef(transport);
  transportReference.current = transport;
  const runReference = useRef(run);
  runReference.current = run;
  const onQueuedReference = useRef(onQueued);
  onQueuedReference.current = onQueued;
  const [queue] = useState(() => new CommandQueue({
    enqueue: (line) => transportReference.current.enqueue(line),
    dequeue: () => transportReference.current.dequeue(),
  }, (line, queued) => runReference.current(line, queued), initiallyBusy));

  useEffect(() => {
    queue.attach();
    return () => { queue.dispose(); };
  }, [queue]);
  useEffect(() => {
    if (queuedLines.length > 0) queue.wake();
  }, [queue, queuedLines]);
  const submit = useCallback((line: string) => {
    if (queue.submit(line)) onQueuedReference.current(line);
  }, [queue]);
  return { queue, submit };
}
