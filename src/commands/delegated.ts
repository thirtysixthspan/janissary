import type { CommandInvocationContext, CommandManagers } from './types.js';
import { appendCommandOutput } from '../command/append.js';

// `harness` and `ssh` both hand their whole input to a manager that answers with an error string or
// nothing at all, and both record the input in the transcript before delegating so the line is
// already there while the tab is being built. One body, two commands — before this existed it was
// the same three statements twice, in two branches ahead of the registry.
export function runDelegated(
  input: string,
  label: string,
  managers: CommandManagers,
  delegate: (input: string) => string | undefined,
  invocation?: CommandInvocationContext,
): void {
  appendCommandOutput(managers, label, { input, output: '' }, invocation);
  const error = delegate(input);
  if (error) appendCommandOutput(managers, label, { input: '', output: error }, invocation);
}
