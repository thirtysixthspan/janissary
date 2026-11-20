import type { AcpPromptResult } from './types.js';
import type { AcpRole } from './role.js';
import type { LogEntry } from '../tab/types.js';

export type AcpPromptAdmission = { isCurrent: () => boolean; onDrop: () => void };

export type PromptResultOptions = {
  appendRefusalToTranscript?: boolean;
  replyId?: string;
  echo?: string;
  admission?: AcpPromptAdmission;
};

export type AcpPendingPrompt = {
  finish: (result: AcpPromptResult) => void;
  abort: AbortController;
  prompt: string;
  role: AcpRole;
  roleName: string;
  commands: string[];
  runningEntries: Set<LogEntry>;
  replyId?: string;
  echo?: string;
  recordId?: string;
  recordName?: string;
  recordPrompt?: string;
  cancellation?: Promise<boolean>;
  // Set once the model has completed a reply turn for this request: from then on it has answered, and
  // a later failure is reported rather than retried on another model.
  replied?: true;
  // Set when the request is about to settle because the model failed — a dead or unstartable agent,
  // or a prompt error — as opposed to a refusal, a cancellation, or a reset.
  modelFailed?: true;
};
