import type { DequeuedCommand, QueueReceipt } from '../command-queue/receipts.js';

export type QueueCapabilityTypes = {
  nextQueuedCommand(): DequeuedCommand | null;
  dispatchQueuedCommand(
    receipt: QueueReceipt,
    options?: { discard?: true },
  ): Promise<{ dispatched: boolean; output: string; coreResponse?: boolean; result?: unknown }>;
};
