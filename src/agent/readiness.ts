// Wait for something an agent run needs before it can start — a remote workspace, a remote agent
// session — but no longer than `timeoutMs`, and not past the run being terminated. One helper for
// every such wait, so the timeout, the abort, and the cleanup of both are written and tested once.
export async function awaitReady<T>(
  promise: Promise<T>, signal: AbortSignal, timeoutMs: number, timeoutMessage: string,
): Promise<T> {
  if (signal.aborted) throw new Error('Agent terminated.');
  let stop = (_error: Error) => {};
  // eslint-disable-next-line unicorn/prefer-promise-with-resolvers -- the project targets ES2023
  const stopped = new Promise<never>((_resolve, reject) => { stop = reject; });
  const onAbort = () => stop(new Error('Agent terminated.'));
  const timeout = setTimeout(() => stop(new Error(timeoutMessage)), timeoutMs);
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    return await Promise.race([promise, stopped]);
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', onAbort);
  }
}
