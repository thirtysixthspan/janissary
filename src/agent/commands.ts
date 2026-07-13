import type { AgentCommand } from '../types.js';
import agentNames from '../../agent-names.json' with { type: 'json' };
import { getConfig } from '../config.js';

export function resolveAgentName(
  input: string,
  existingLabels: string[],
): string | null {
  const trimmed = input.trim();
  const match = trimmed.match(/^agent\s+(.+)/i);

  if (match) {
    return match[1].trim().toLowerCase().slice(0, getConfig().tabNameMaxLength);
  }

  const lowerExisting = new Set(existingLabels.map((l) => l.toLowerCase()));
  const pool = agentNames.filter((n) => !lowerExisting.has(n));
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function parseAgentCommand(input: string): AgentCommand {
  const trimmed = input.trim();
  const isWorkspace = /\s(-w|--workspace)\b/i.test(trimmed);
  const isOffline = /\s--offline\b/i.test(trimmed);
  const stripped = trimmed
    .replaceAll(/\s+(-w|--workspace|--offline)(?=\s|$)/gi, '')
    .replaceAll(/\s+/g, ' ')
    .trim();
  const nameMatch = stripped.match(/^agent\s+(.+)/i);
  return {
    name: nameMatch ? nameMatch[1].trim().toLowerCase().slice(0, getConfig().tabNameMaxLength) : '',
    workspace: isWorkspace,
    offline: isOffline,
  };
}
