export const READ_DEADLINE_MS = 30_000;

export async function readWithDeadline<T>(
  read: (signal: AbortSignal) => Promise<T>,
  controller: AbortController,
): Promise<T> {
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    deadline = setTimeout(() => {
      controller.abort(new Error(`Git diff read timed out after ${READ_DEADLINE_MS} ms`));
      reject(controller.signal.reason);
    }, READ_DEADLINE_MS);
  });
  const cancelled = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener('abort', () => {
      reject(controller.signal.reason ?? new Error('Git diff read aborted'));
    }, { once: true });
  });
  try {
    return await Promise.race([read(controller.signal), timeout, cancelled]);
  } finally {
    if (deadline !== undefined) clearTimeout(deadline);
  }
}
