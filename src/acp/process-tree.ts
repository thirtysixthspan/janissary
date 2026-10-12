import type { ChildProcess } from 'node:child_process';

const SHUTDOWN_GRACE_MS = 1000;
const SHUTDOWN_TIMEOUT_MS = 5000;

type ShutdownOperations = {
  isRunning: (proc: ChildProcess) => boolean;
  signal: (proc: ChildProcess, signal: NodeJS.Signals) => void;
};

function processGroupExists(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return false;
    if (error instanceof Error && 'code' in error && error.code === 'EPERM') return false;
    throw error;
  }
}

function signalOwnedProcess(proc: ChildProcess, signal: NodeJS.Signals): void {
  if (proc.pid === undefined) throw new Error('ACP agent process did not start.');
  if (process.platform === 'win32') {
    proc.kill(signal);
    return;
  }
  try {
    process.kill(-proc.pid, signal);
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) throw error;
  }
}

function stillRunning(proc: ChildProcess): boolean {
  if (proc.pid === undefined) return false;
  return process.platform === 'win32' ? proc.exitCode === null : processGroupExists(proc.pid);
}

async function waitForExit(
  proc: ChildProcess,
  exited: Promise<void>,
  timeoutAt: number,
  isRunning: ShutdownOperations['isRunning'],
): Promise<void> {
  while (isRunning(proc)) {
    if (Date.now() >= timeoutAt) throw new Error('ACP process tree shutdown timed out.');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  await exited;
}

export async function shutdownProcessTree(
  proc: ChildProcess,
  exited: Promise<void>,
  graceMs = SHUTDOWN_GRACE_MS,
  timeoutMs = SHUTDOWN_TIMEOUT_MS,
  operations?: ShutdownOperations,
): Promise<void> {
  if (proc.pid === undefined) {
    await exited;
    return;
  }
  const shutdownOperations = operations ?? { isRunning: stillRunning, signal: signalOwnedProcess };
  const timeoutAt = Date.now() + timeoutMs;
  shutdownOperations.signal(proc, 'SIGTERM');
  try {
    await waitForExit(proc, exited, Math.min(timeoutAt, Date.now() + graceMs), shutdownOperations.isRunning);
    return;
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'ACP process tree shutdown timed out.') throw error;
  }
  shutdownOperations.signal(proc, 'SIGKILL');
  await waitForExit(proc, exited, timeoutAt, shutdownOperations.isRunning);
}
