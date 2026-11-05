type OwnedRunResources = {
  id: string;
  allocations: ReadonlySet<Promise<void>>;
  cleanups: readonly (() => void | Promise<void>)[];
  releaseWorkspace?: () => Promise<void>;
  childIds: Set<string>;
  createdTabs: Set<string>;
  clearListeners: () => void;
};

export async function cleanupAgentRun(resources: OwnedRunResources): Promise<void> {
  const failures: unknown[] = [];
  await Promise.all(resources.allocations);
  for (const cleanup of resources.cleanups) {
    try { await cleanup(); } catch (error) { failures.push(error); }
  }
  if (resources.releaseWorkspace) {
    try { await resources.releaseWorkspace(); } catch (error) { failures.push(error); }
  }
  resources.childIds.clear();
  resources.createdTabs.clear();
  resources.clearListeners();
  if (failures.length > 0) throw new AggregateError(failures, `Agent run ${resources.id} cleanup failed.`);
}
