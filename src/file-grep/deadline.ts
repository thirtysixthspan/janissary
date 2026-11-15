export type DeadlineResult<T> =
  | { kind: 'completed'; value: T }
  | { kind: 'timeout' };

export async function withDeadline<T>(deadline: number, operation: () => Promise<T>): Promise<DeadlineResult<T>> {
  const now = Date.now();
  if (now >= deadline) return { kind: 'timeout' };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<DeadlineResult<T>>((resolve) => {
    timer = setTimeout(() => resolve({ kind: 'timeout' }), deadline - now);
  });
  const complete = async (): Promise<DeadlineResult<T>> => {
    const value = await operation();
    return { kind: 'completed', value };
  };
  try {
    return await Promise.race([complete(), timedOut]);
  } finally {
    clearTimeout(timer);
  }
}
