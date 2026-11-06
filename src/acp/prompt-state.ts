import type { AcpPromptResult } from './types.js';
import type { AcpRole } from './role.js';

export type AcpPendingPrompt = {
  finish: (result: AcpPromptResult) => void;
  abort: AbortController;
  prompt: string;
  role: AcpRole;
  roleName: string;
  commands: string[];
  recordId?: string;
  cancellation?: Promise<boolean>;
  // Set once the model has completed a reply turn for this request: from then on it has answered, and
  // a later failure is reported rather than retried on another model.
  replied?: true;
  // Set when the request is about to settle because the model failed — a dead or unstartable agent,
  // or a prompt error — as opposed to a refusal, a cancellation, or a reset.
  modelFailed?: true;
};
