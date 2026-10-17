import type { ShellQueuedCommand } from '@shared/plugins/shell/shared';

export type QueuedCommandTransport = {
  dequeue(): Promise<ShellQueuedCommand>;
  discard(receipt: string): Promise<void>;
};

export type ReceiptRunner = (line: string, queued: boolean, receipt?: string) => Promise<boolean>;

export function createQueuedCommandAdapter(transport: QueuedCommandTransport, run: ReceiptRunner) {
  let outstanding: string | undefined;
  let inFlight: string | undefined;
  let disposed = false;

  return {
    attach(): void {
      disposed = false;
    },
    async dequeue(): Promise<string | null> {
      const command = await transport.dequeue();
      if (!command) return null;
      if (disposed) {
        await transport.discard(command.receipt);
        return null;
      }
      outstanding = command.receipt;
      return command.line;
    },
    async run(line: string, queued: boolean): Promise<boolean> {
      const receipt = queued ? outstanding : undefined;
      if (queued) outstanding = undefined;
      inFlight = receipt;
      try {
        return await run(line, queued, receipt);
      } catch (error: unknown) {
        if (receipt) await transport.discard(receipt);
        throw error;
      } finally {
        if (inFlight === receipt) inFlight = undefined;
      }
    },
    async dispose(): Promise<void> {
      disposed = true;
      const receipt = outstanding;
      outstanding = undefined;
      if (receipt) await transport.discard(receipt);
      const runningReceipt = inFlight;
      inFlight = undefined;
      if (runningReceipt) await transport.discard(runningReceipt);
    },
  };
}
