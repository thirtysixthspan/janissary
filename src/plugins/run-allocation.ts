import type { Managers } from '../managers.js';

export function withRunAllocation<Result>(
  managers: Managers, runId: string | undefined, allocate: () => Result,
): Result | undefined {
  if (!runId) return allocate();
  const isAgentRun = managers.agent?.isAgentRun;
  if (!isAgentRun?.call(managers.agent, runId)) return allocate();
  const begin = managers.agent?.beginAllocation;
  if (!begin) return allocate();
  const complete = begin.call(managers.agent, runId);
  if (!complete) return undefined;
  const existing = new Set(managers.tab.tabs.map((tab) => tab.label));
  try {
    return allocate();
  } finally {
    trackNewTabs(managers, runId, existing);
    complete();
  }
}

export async function withRunAllocationAsync(
  managers: Managers, runId: string | undefined, allocate: () => Promise<void>,
): Promise<void> {
  if (!runId) return allocate();
  const isAgentRun = managers.agent?.isAgentRun;
  if (!isAgentRun?.call(managers.agent, runId)) return allocate();
  const begin = managers.agent?.beginAllocation;
  if (!begin) return allocate();
  const complete = begin.call(managers.agent, runId);
  if (!complete) return;
  const existing = new Set(managers.tab.tabs.map((tab) => tab.label));
  try {
    await allocate();
  } finally {
    trackNewTabs(managers, runId, existing);
    complete();
  }
}

function trackNewTabs(managers: Managers, runId: string, existing: ReadonlySet<string>): void {
  for (const tab of managers.tab.tabs) {
    if (!existing.has(tab.label)) managers.agent.trackCreatedTab(runId, tab.label);
  }
}
