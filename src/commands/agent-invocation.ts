import { randomUUID } from 'node:crypto';
import type { CommandInvocationContext, CommandManagers } from './types.js';

export function invocationFor(
  label: string,
  managers: CommandManagers,
  invocation?: CommandInvocationContext,
): CommandInvocationContext {
  const tab = managers.tab.byLabel(label);
  if (!tab) throw new Error(`Agent caller not found: ${label}`);
  const captured = managers.agent.captureCaller(tab);
  if (invocation?.caller.incarnation && invocation.caller.incarnation !== captured.incarnation) {
    throw new Error(`Agent caller is stale: ${label}`);
  }
  if (invocation) {
    return Object.freeze({
      ...invocation,
      caller: Object.freeze({ ...captured, cwd: invocation.caller.cwd, context: invocation.caller.context }),
    });
  }
  return Object.freeze({
    runId: randomUUID(),
    invocationId: randomUUID(),
    caller: { ...captured, incarnation: captured.incarnation ?? randomUUID() },
    signal: new AbortController().signal,
  });
}
