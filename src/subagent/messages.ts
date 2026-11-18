import type { AgentOutcome } from '../agent/run.js';
import type { AcpRole } from '../acp/role.js';

export type SubagentStartedMessage = Readonly<{
  status: 'started';
  role: string;
  sessionId: string;
  callerId: string;
}>;

export type SubagentCompletionMessage = Readonly<{
  status: AgentOutcome;
  sessionId: string | null;
  callerId: string;
  output: string;
}>;

export type SubagentMessage = SubagentStartedMessage | SubagentCompletionMessage;

export type SubagentDelivery = Readonly<{
  runId: string;
  callerIncarnation: string;
  callerRole: AcpRole;
  callerSessionIdentity: string;
  subagentRole: string;
  message: SubagentMessage;
}>;

export function serializeSubagentMessage(message: SubagentMessage): string {
  return JSON.stringify(message.status === 'started'
    ? {
      status: message.status,
      role: message.role,
      sessionId: message.sessionId,
      callerId: message.callerId,
    }
    : {
      status: message.status,
      sessionId: message.sessionId,
      callerId: message.callerId,
      output: message.output,
    });
}

export function subagentStartedText(role: string): string {
  return `Subagent ${role} started.`;
}

export function subagentCompletionText(role: string, status: AgentOutcome, output: string): string {
  return `Subagent ${role} ${status}.\n\n${output}`;
}
