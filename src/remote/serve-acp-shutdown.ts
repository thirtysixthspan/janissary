import type { AcpSession } from '../acp/types.js';

const ACP_SHUTDOWN_TIMEOUT_MS = 5000;

export async function stopSession(session: AcpSession): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => { resolve(false); }, ACP_SHUTDOWN_TIMEOUT_MS);
  });
  const stopped = (async () => {
    try {
      await session.shutdown();
      return true;
    } catch {
      return false;
    }
  })();
  try {
    return await Promise.race([stopped, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
