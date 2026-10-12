import type { AgentSnapshot } from '../../agent/types.js';
import { malformed, nonEmptyString, type DecodeResult } from './decode-shared.js';

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function decodeSnapshot(value: unknown): AgentSnapshot | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const snapshot = value as Record<string, unknown>;
  if (!nonEmptyString(snapshot.taskPath) || typeof snapshot.taskText !== 'string'
    || !stringArray(snapshot.grants) || !Array.isArray(snapshot.skills)) return undefined;
  const skills = snapshot.skills.filter((skill): skill is Record<string, unknown> =>
    typeof skill === 'object' && skill !== null && !Array.isArray(skill));
  if (skills.length !== snapshot.skills.length || skills.some((skill) =>
    !nonEmptyString(skill.name) || !nonEmptyString(skill.path) || typeof skill.instructions !== 'string')) return undefined;
  return {
    taskPath: snapshot.taskPath,
    taskText: snapshot.taskText,
    skills: skills.map((skill) => ({ name: skill.name as string, path: skill.path as string, instructions: skill.instructions as string })),
    grants: snapshot.grants,
  };
}

export function decodeAgentResolve(record: Record<string, unknown>): DecodeResult {
  if (!nonEmptyString(record.id) || !nonEmptyString(record.task) || !stringArray(record.skills)) return malformed('agent-resolve');
  return { type: 'agent-resolve', id: record.id, task: record.task, skills: record.skills };
}

export function decodeAgentResolveResult(record: Record<string, unknown>): DecodeResult {
  if (!nonEmptyString(record.id)) return malformed('agent-resolve-result');
  const snapshot = record.snapshot === undefined ? undefined : decodeSnapshot(record.snapshot);
  if ((record.snapshot !== undefined && snapshot === undefined)
    || (record.error !== undefined && !nonEmptyString(record.error))
    || (snapshot === undefined && record.error === undefined)
    || (snapshot !== undefined && record.error !== undefined)) return malformed('agent-resolve-result');
  return {
    type: 'agent-resolve-result', id: record.id,
    ...(snapshot !== undefined && { snapshot }),
    ...(typeof record.error === 'string' && { error: record.error }),
  };
}
