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
