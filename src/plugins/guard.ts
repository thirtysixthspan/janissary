// Bounds a call into a plugin handler that returns a promise: a handler that blocks synchronously
// outruns this, which is why the trust note in each host's `api.ts` says what a plugin module is
// allowed to do at import time. Shared by the server and the web hosts, so both sides time a
// misbehaving handler the same way and report it in the same words.
export async function guardPluginCall<Result>(
  call: () => Result | Promise<Result>,
  timeoutMs: number,
): Promise<Result> {
  const signal = AbortSignal.timeout(timeoutMs);
  const timeout = new Promise<never>((_resolve, reject) => {
    signal.addEventListener('abort', () => {
      reject(new Error(`handler timed out after ${timeoutMs} ms`));
    }, { once: true });
  });
  const running = (async () => call())();
  return Promise.race([running, timeout]);
}
