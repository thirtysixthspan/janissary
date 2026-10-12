import type { AgentResult } from './execute.js';

export function formatAgentResult(result: AgentResult): string {
  return [
    `Status: ${result.status}`,
    result.response,
    ...result.cleanupWarnings.map((warning) => `Cleanup warning: ${warning}`),
  ].join('\n');
}
