import type { CommandInvocationContext, CommandManagers } from '../commands/types.js';
import type { AgentRun } from './run.js';

export function createRunCompletion(): { promise: Promise<void>; resolve: () => void } {
  const promiseConstructor = Promise as PromiseConstructor & {
    withResolvers<T>(): { promise: Promise<T>; resolve: (value: T | PromiseLike<T>) => void };
  };
  const completion = promiseConstructor.withResolvers<void>();
  return { promise: completion.promise, resolve: () => completion.resolve() };
}

export function trustedParentRun(
  invocation: CommandInvocationContext,
  managers: CommandManagers,
): AgentRun | undefined {
  const parent = managers.agent.runs.get(invocation.runId);
  if (!parent || parent.outcome || parent.abortController.signal !== invocation.signal
    || parent.caller.label !== invocation.caller.label
    || parent.caller.incarnation !== invocation.caller.incarnation) return undefined;
  return parent;
}

export function trackChildRun(
  parent: AgentRun,
  child: AgentRun,
  managers: CommandManagers,
  completion: Promise<void>,
): void {
  parent.addResource(child.id, async () => {
    if (managers.agent.runs.has(child.id)) await managers.agent.finish(child.id, 'terminated');
    await completion;
  });
}
