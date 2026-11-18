import type { Managers } from '../managers.js';
import type { AgentOutcome, AgentRun } from '../agent/run.js';
import { settleAgentRun } from '../agent/settle-run.js';
import { errorText } from '../error-text.js';
import type { SubagentExecutionResult } from './execute.js';
import type { SubagentReplySink } from './replies.js';

export type SubagentSettlementResult = Readonly<{
  status: AgentOutcome;
  response: string;
  sessionId: string | null;
  cleanupWarnings: readonly string[];
}>;

export type SubagentSettlementOptions = Readonly<{
  run: AgentRun;
  managers: Managers;
  sink: SubagentReplySink;
  firstProviderId: () => string | null;
  executionReached: () => boolean;
  execute: () => Promise<SubagentExecutionResult>;
}>;

export async function settleSubagentRun(options: SubagentSettlementOptions): Promise<SubagentSettlementResult> {
  const { run, managers, sink, firstProviderId, executionReached, execute } = options;
  let result: SubagentExecutionResult;
  try {
    result = await execute();
  } catch (error) {
    const response = errorText(error);
    if (executionReached() && !run.abortController.signal.aborted) run.abortController.abort();
    result = { status: 'failed', response, sessionId: firstProviderId(), cleanupWarnings: [] };
  }

  if (run.outcome === undefined) run.setStatus('Cleaning up', result.response);
  const settlementWarnings = await settleAgentRun(run, result.status, managers);
  const status: AgentOutcome = run.outcome === 'terminated' ? 'terminated' : result.status;
  const response = status === 'terminated' ? 'Subagent terminated.' : result.response;
  const settled: SubagentSettlementResult = {
    status,
    response,
    sessionId: result.sessionId,
    cleanupWarnings: [...result.cleanupWarnings, ...settlementWarnings],
  };

  sink.completion(status, response, result.sessionId);
  return settled;
}
