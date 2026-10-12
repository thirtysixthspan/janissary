import type { Managers } from '../managers.js';

export type RegisterRunTab = (label: string) => void;

export function withRunAllocation<Result>(
  managers: Managers, runId: string | undefined, allocate: (registerTab: RegisterRunTab) => Result,
): Result | undefined {
  const ignoreTab: RegisterRunTab = () => {};
  if (!runId) return allocate(ignoreTab);
  const isAgentRun = managers.agent?.isAgentRun;
  if (!isAgentRun?.call(managers.agent, runId)) return allocate(ignoreTab);
  const begin = managers.agent?.beginAllocation;
  if (!begin) return allocate(ignoreTab);
  const complete = begin.call(managers.agent, runId);
  if (!complete) return undefined;
  try {
    return allocate((label) => managers.agent.trackCreatedTab(runId, label));
  } finally {
    complete();
  }
}

export async function withRunAllocationAsync(
  managers: Managers, runId: string | undefined, allocate: (registerTab: RegisterRunTab) => Promise<void>,
): Promise<void> {
  const ignoreTab: RegisterRunTab = () => {};
  if (!runId) return allocate(ignoreTab);
  const isAgentRun = managers.agent?.isAgentRun;
  if (!isAgentRun?.call(managers.agent, runId)) return allocate(ignoreTab);
  const begin = managers.agent?.beginAllocation;
  if (!begin) return allocate(ignoreTab);
  const complete = begin.call(managers.agent, runId);
  if (!complete) return;
  try {
    await allocate((label) => managers.agent.trackCreatedTab(runId, label));
  } finally {
    complete();
  }
}
