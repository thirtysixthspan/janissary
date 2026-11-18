import { randomUUID } from 'node:crypto';
import type { Managers } from '../managers.js';
import type { AgentAcpCaller, AgentOutcome, AgentRun } from '../agent/run.js';
import type { AcpDispatchReceipt } from '../acp/response.js';
import type { TabRuntime } from '../tab/types.js';
import type { SubagentDelivery, SubagentMessage } from './messages.js';
import { subagentCompletionText, subagentStartedText } from './messages.js';

export type SubagentReplySink = Readonly<{
  started(sessionId: string): void;
  completion(status: AgentOutcome, response: string, sessionId: string | null): void;
}>;

export type SubagentReplyContext = Readonly<{
  managers: Managers;
  run: AgentRun;
  receipt: Extract<AcpDispatchReceipt, { kind: 'record' }>;
  input: string;
  label: string;
  runtime: TabRuntime;
  incarnation: string;
  role: string;
  acpCaller?: AgentAcpCaller;
}>;

export function createSubagentReplySink(context: SubagentReplyContext): SubagentReplySink {
  const { managers, run, receipt, input, label, runtime, incarnation, role, acpCaller } = context;
  let started = false;
  let completed = false;

  const open = (): boolean => {
    const tab = managers.tab.byLabel(label);
    return tab?.runtime === runtime && !runtime.closing && tab.runtime?.incarnation === incarnation;
  };

  const send = (message: SubagentMessage): void => {
    if (!acpCaller) return;
    const delivery: SubagentDelivery = {
      runId: run.id,
      callerIncarnation: incarnation,
      callerRole: acpCaller.role,
      callerSessionIdentity: acpCaller.sessionIdentity,
      subagentRole: role,
      message,
    };
    managers.acp.deliver(label, acpCaller.role, delivery);
  };

  return Object.freeze({
    started(sessionId: string): void {
      if (started || run.outcome !== undefined) return;
      started = true;
      if (acpCaller) {
        send({ status: 'started', role, sessionId, callerId: acpCaller.callerId });
        return;
      }
      if (!open()) return;
      managers.tab.append(label, { input, output: subagentStartedText(role), background: randomUUID() });
    },
    completion(status: AgentOutcome, response: string, sessionId: string | null): void {
      if (completed) return;
      completed = true;
      if (acpCaller) {
        send({ status, sessionId, callerId: acpCaller.callerId, output: response });
        return;
      }
      if (!open()) return;
      managers.tab.append(label, {
        input,
        output: subagentCompletionText(role, status, response),
        background: receipt.replyId,
        backgroundRecord: { id: receipt.recordId, name: receipt.name },
      });
    },
  });
}
