import type { Managers } from '../managers.js';
import type { AgentOutcome, AgentRun } from './run.js';

function cleanupErrorMessages(error: unknown): string[] {
  const failures = error instanceof AggregateError ? error.errors : [error];
  return failures.map((failure) => failure instanceof Error ? failure.message : String(failure));
}

export async function settleAgentRun(
  run: AgentRun,
  outcome: AgentOutcome,
  managers: Managers,
): Promise<string[]> {
  try {
    if (managers.agent.runs.has(run.id)) await managers.agent.finish(run.id, outcome);
    else await run.finish(run.outcome ?? outcome);
  } catch (error) {
    return cleanupErrorMessages(error);
  }
  return [];
}
