import type { Command } from './types.js';
import { acpAvailable } from '../acp/availability.js';
import { appendAcpBackgroundReply } from '../acp/response.js';
import type { AcpPromptResult } from '../acp/types.js';
import { errorText } from '../error-text.js';

export const command: Command = {
  name: 'tell',
  available: acpAvailable,
  coreResponse: true,
  match: (command_) => /^tell\b/i.test(command_),
  samples: ['tell', 'tell hello'],
  run: (command, tab, managers, invocation) => {
    const line = invocation?.line ?? command;
    let settled = false;
    const settle = (result: AcpPromptResult) => {
      if (settled) return;
      settled = true;
      appendAcpBackgroundReply(managers, tab.label, line, result);
    };
    void managers.acp.promptResult(tab.label, command, 'tell').then(
      settle,
      (error: unknown) => settle({ answered: false, error: `ACP error: ${errorText(error)}` }),
    );
  },
};
