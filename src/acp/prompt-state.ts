import type { AcpPromptResult } from './types.js';

export type AcpPendingPrompt = {
  finish: (result: AcpPromptResult) => void;
  abort: AbortController;
  prompt: string;
  recordId?: string;
  cancellation?: Promise<boolean>;
};
