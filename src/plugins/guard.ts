// The clock a guarded call runs against. `exempt` is for work the host does on the plugin's behalf
// while the plugin waits on it — running a whole application command, say — which is the host's time
// and must not be charged to the plugin. The clock stops while any exempted work is in flight and
// resumes with whatever budget the plugin had left once the last of it settles.
export type HandlerDeadline = {
  exempt<Value>(work: () => Promise<Value>): Promise<Value>;
};

// Bounds a call into a plugin handler that returns a promise: a handler that blocks synchronously
// outruns this, which is why the trust note in each host's `api.ts` says what a plugin module is
// allowed to do at import time. Shared by the server and the web hosts, so both sides time a
// misbehaving handler the same way and report it in the same words.
export async function guardPluginCall<Result>(
  call: (deadline: HandlerDeadline) => Result | Promise<Result>,
  timeoutMs: number,
): Promise<Result> {
  let remaining = timeoutMs;
  let startedAt = 0;
  let holds = 0;
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expire: (error: Error) => void = () => {};
  // eslint-disable-next-line unicorn/prefer-promise-with-resolvers -- the web hosts import this module, and the web project's ES2023 library excludes Promise.withResolvers
  const timeout = new Promise<never>((_resolve, reject) => { expire = reject; });

  const arm = () => {
    startedAt = Date.now();
    timer = setTimeout(() => { expire(new Error(`handler timed out after ${timeoutMs} ms`)); }, remaining);
  };
  const deadline: HandlerDeadline = {
    exempt: async (work) => {
      holds += 1;
      if (holds === 1) {
        clearTimeout(timer);
        remaining = Math.max(0, remaining - (Date.now() - startedAt));
      }
      try {
        return await work();
      } finally {
        holds -= 1;
        if (holds === 0 && !settled) arm();
      }
    },
  };

  arm();
  try {
    const running = (async () => call(deadline))();
    return await Promise.race([running, timeout]);
  } finally {
    settled = true;
    clearTimeout(timer);
  }
}
