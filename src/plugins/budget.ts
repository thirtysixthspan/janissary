// The single promise race every host-to-plugin boundary passes through: server import plus
// activation, each guarded handler, plugin disposal, and the client's combined chunk-import-plus-
// activation deadline. Shared by both trees so the two sides cannot drift apart on what a blown
// budget looks like.
//
// Built straight from the runtime rather than a timer abstraction — these are the only call sites,
// and `label` is what makes the resulting failure message actionable.
export function withBudget<T>(work: Promise<T>, milliseconds: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => { reject(new Error(`${label} timed out after ${milliseconds} ms`)); }, milliseconds);
    void work.then(
      (result) => { clearTimeout(timer); resolve(result); },
      (error: unknown) => { clearTimeout(timer); reject(error instanceof Error ? error : new Error(String(error))); },
    );
  });
}
