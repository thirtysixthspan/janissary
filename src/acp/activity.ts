import { isRecord } from '../value-guards.js';

// What an agent run's monitor shows of an ACP session's updates: the five kinds the agent-command
// spec names, each with plain text. One mapping for both hosts — a run executed locally and one
// executed on a remote host produce the same activity — so a monitor never shows a raw
// `sessionUpdate` name followed by a JSON dump for one and clean text for the other.

export const ACP_ACTIVITY_KINDS = ['message', 'thought', 'tool', 'plan', 'permission'] as const;

export type AcpActivityKind = typeof ACP_ACTIVITY_KINDS[number];

export type AcpActivity = { kind: AcpActivityKind; text: string };

export function isAcpActivityKind(value: unknown): value is AcpActivityKind {
  return (ACP_ACTIVITY_KINDS as readonly unknown[]).includes(value);
}

// Every other update kind (a user message echo, the available commands, a mode change) is session
// bookkeeping rather than something the run did, so it is not activity at all.
function activityKind(update: string): AcpActivityKind | undefined {
  if (update === 'agent_message_chunk') return 'message';
  if (update === 'agent_thought_chunk') return 'thought';
  if (update.includes('tool')) return 'tool';
  if (update.includes('plan')) return 'plan';
  if (update.includes('permission')) return 'permission';
  return undefined;
}

// String content as it is, a text content block's text, and anything else as JSON so a tool call's
// or plan's structure still reads.
function activityText(content: unknown, update: Record<string, unknown>): string {
  if (typeof content === 'string') return content;
  if (isRecord(content) && typeof content.text === 'string') return content.text;
  return JSON.stringify(content ?? update);
}

export function acpActivity(update: unknown): AcpActivity | undefined {
  if (!isRecord(update) || typeof update.sessionUpdate !== 'string') return undefined;
  const kind = activityKind(update.sessionUpdate);
  if (!kind) return undefined;
  return { kind, text: activityText(update.content, update) };
}
