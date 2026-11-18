import { randomUUID } from 'node:crypto';
import type { Managers } from '../managers.js';
import type { AcpRole } from './role.js';
import type { AcpPromptResult } from './types.js';
import type { PromptResultOptions } from './prompt-state.js';
import type { SubagentDelivery } from '../subagent/messages.js';
import { serializeSubagentMessage } from '../subagent/messages.js';
import { enqueueSubagentMessage } from './subagent-queue.js';
import { acpRoleRuntime, existingAcpRoleRuntime } from './role-state.js';
import { appendAcpBackgroundReply } from './response.js';
import { errorText } from '../error-text.js';
import { tabRuntime } from '../tab/runtime.js';
import type { TabRuntime } from '../tab/types.js';

export type SubagentPrompt = (
  label: string, command: string, role: AcpRole, options: PromptResultOptions,
) => Promise<AcpPromptResult>;

function isCurrentSubagentCaller(
  managers: Managers, label: string, role: AcpRole, runtime: TabRuntime, delivery: SubagentDelivery,
): boolean {
  if (managers.agent?.disposing) return false;
  const tab = managers.tab.byLabel(label);
  if (tab?.runtime !== runtime || runtime.closing) return false;
  return runtime.incarnation === delivery.callerIncarnation
    && delivery.callerRole === role
    && managers.acp.sessionIdentity(label, role) === delivery.callerSessionIdentity;
}

export function deliverSubagentMessage(
  managers: Managers, prompt: SubagentPrompt, label: string, role: AcpRole, delivery: SubagentDelivery,
): void {
  const tab = managers.tab.byLabel(label);
  if (!tab || tab.runtime?.closing) return;
  const runtime = tabRuntime(tab);
  const state = acpRoleRuntime(runtime, role);
  state.pendingSubagentMessages = enqueueSubagentMessage(state.pendingSubagentMessages ?? [], delivery);
  drainSubagentMessages(managers, prompt, label, role, runtime);
}

function drainSubagentMessages(
  managers: Managers, prompt: SubagentPrompt, label: string, role: AcpRole, runtime: TabRuntime,
): void {
  const state = existingAcpRoleRuntime(runtime, role);
  if (!state || state.prompt || state.subagentDeliveryInFlight || state.subagentDrainScheduled) return;
  let queue = state.pendingSubagentMessages ?? [];
  while (queue.length > 0 && !isCurrentSubagentCaller(managers, label, role, runtime, queue[0])) {
    queue = queue.slice(1);
  }
  state.pendingSubagentMessages = queue;
  const [head, ...rest] = queue;
  if (!head) return;
  state.pendingSubagentMessages = rest;
  const token = Symbol();
  state.subagentDeliveryInFlight = token;
  dispatchSubagentMessage(managers, prompt, label, role, runtime, head, token);
}

function dispatchSubagentMessage(
  managers: Managers, prompt: SubagentPrompt, label: string, role: AcpRole, runtime: TabRuntime,
  delivery: SubagentDelivery, token: symbol,
): void {
  const replyId = randomUUID();
  const echo = `${role} ← subagent:${delivery.subagentRole} ${delivery.message.status}`;
  let dropped = false;
  const settle = (result: AcpPromptResult): void => {
    try {
      const tab = managers.tab.byLabel(label);
      if (!dropped && tab?.runtime === runtime && runtime.incarnation === delivery.callerIncarnation && !runtime.closing) {
        appendAcpBackgroundReply(managers, label, echo, result, replyId);
      }
    } finally {
      const state = existingAcpRoleRuntime(runtime, role);
      if (state?.subagentDeliveryInFlight === token) {
        delete state.subagentDeliveryInFlight;
        scheduleSubagentDrain(managers, prompt, label, role, runtime);
      }
    }
  };
  void prompt(label, serializeSubagentMessage(delivery.message), role, {
    appendRefusalToTranscript: false,
    replyId,
    echo,
    admission: {
      isCurrent: () => isCurrentSubagentCaller(managers, label, role, runtime, delivery),
      onDrop: () => { dropped = true; },
    },
  }).then(settle, (error: unknown) => settle({ answered: false, error: `ACP error: ${errorText(error)}` }));
}

export function scheduleSubagentDrain(
  managers: Managers, prompt: SubagentPrompt, label: string, role: AcpRole, runtime: TabRuntime,
): void {
  const state = existingAcpRoleRuntime(runtime, role);
  if (!state || state.subagentDrainScheduled) return;
  const token = Symbol();
  state.subagentDrainScheduled = token;
  queueMicrotask(() => {
    queueMicrotask(() => {
      const current = managers.tab.byLabel(label)?.runtime === runtime && !runtime.closing;
      const owner = existingAcpRoleRuntime(runtime, role);
      if (!current || owner?.subagentDrainScheduled !== token) return;
      delete owner.subagentDrainScheduled;
      drainSubagentMessages(managers, prompt, label, role, runtime);
    });
  });
}

export function closeSubagentSession(
  managers: Managers, label: string, role: AcpRole, runtime: TabRuntime | undefined,
  identity: string | undefined,
): void {
  const state = runtime ? existingAcpRoleRuntime(runtime, role) : undefined;
  if (state) {
    delete state.pendingSubagentMessages;
    delete state.subagentDeliveryInFlight;
    delete state.subagentDrainScheduled;
  }
  const agent = managers.agent;
  if (!agent || !runtime || !identity) return;
  for (const run of agent.runs.values()) {
    if (run.outcome !== undefined) continue;
    const caller = run.acpCaller;
    if (caller?.role === role && caller.sessionIdentity === identity
      && run.caller.label === label && run.caller.incarnation === runtime.incarnation) {
      void agent.finish(run.id, 'terminated').catch(() => {});
    }
  }
}
