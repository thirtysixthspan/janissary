import { randomUUID } from 'node:crypto';
import type { CommandInvocationContext } from '../commands/types.js';
import type { Managers } from '../managers.js';
import { tabRuntime } from '../tab/runtime.js';

export type InvocationOptions = Readonly<{
  signal?: AbortSignal;
  awaitResult?: true;
  acpTool?: true;
}>;

export function createInvocationContext(
  managers: Managers,
  label: string,
  line?: string,
  options: InvocationOptions = {},
): CommandInvocationContext {
  const tab = managers.tab.byLabel(label);
  const runtime = tab ? tabRuntime(tab) : undefined;
  return Object.freeze({
    runId: randomUUID(),
    invocationId: randomUUID(),
    caller: Object.freeze({
      label,
      ...(runtime?.incarnation && { incarnation: runtime.incarnation }),
      cwd: managers.tab.workingDirOf(label),
      context: Object.freeze([...(runtime?.context ?? [])]),
    }),
    signal: options.signal ?? new AbortController().signal,
    ...(line !== undefined && { line }),
    ...(options.awaitResult && { awaitResult: true }),
    ...(options.acpTool && { acpTool: true }),
  });
}

export function childInvocationContext(
  parent: CommandInvocationContext,
  line?: string,
): CommandInvocationContext {
  return Object.freeze({
    runId: parent.runId,
    invocationId: randomUUID(),
    caller: parent.caller,
    signal: parent.signal,
    ...(line !== undefined && { line }),
    ...(parent.awaitResult && { awaitResult: true }),
    ...(parent.acpTool && { acpTool: true }),
    ...(parent.systemSchedule && { systemSchedule: parent.systemSchedule }),
  });
}
