import type { LogEntry } from '../tab/types.js';
import type { CommandInvocationContext, CommandManagers } from '../commands/types.js';

export function appendCommandOutput(
  managers: CommandManagers,
  label: string,
  entry: LogEntry,
  invocation?: CommandInvocationContext,
): void {
  if (invocation) managers.tab.appendForInvocation(label, entry, invocation.invocationId);
  else managers.tab.append(label, entry);
}
