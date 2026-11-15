import { Worker } from 'node:worker_threads';
import { workerExecArgv } from '../search/matching-worker.js';
import { isRecord } from '../value-guards.js';
import type { GrepFilterRequest, GrepFilterResponse } from './filter-worker-protocol.js';

export function grepFilterWorkerEntry(moduleUrl: string): URL {
  const source = moduleUrl.endsWith('.ts');
  return new URL(source ? './filter-worker-entry.ts' : './filter-worker-entry.js', moduleUrl);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isGrepFilterResponse(value: unknown): value is GrepFilterResponse {
  return isRecord(value) && isStringArray(value.paths);
}

function startFilterWorker(paths: readonly string[], include: string, exclude: string): Worker {
  const request: GrepFilterRequest = { paths: [...paths], include, exclude };
  return new Worker(grepFilterWorkerEntry(import.meta.url), {
    workerData: request,
    execArgv: workerExecArgv(import.meta.url),
  });
}

function runFilterWorker(worker: Worker, signal: AbortSignal): Promise<string[]> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let terminationRequested = false;

    const release = (): void => {
      worker.off('message', onMessage);
      worker.off('error', onError);
      worker.off('exit', onExit);
    };

    const terminate = (): void => {
      if (terminationRequested) return;
      terminationRequested = true;
      let termination: Promise<number>;
      try {
        termination = worker.terminate();
      } catch {
        release();
        return;
      }
      void termination.then(release, release);
    };

    const finish = (settle: () => void): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      settle();
      terminate();
    };

    const onMessage = (message: unknown): void => {
      if (settled) return;
      if (isGrepFilterResponse(message)) {
        finish(() => resolve(message.paths));
        return;
      }
      finish(() => reject(new Error('File grep filter worker sent an invalid response')));
    };
    const onError = (error: Error): void => finish(() => reject(error));
    const onExit = (code: number): void => finish(() => reject(new Error(`File grep filter worker exited with code ${code}`)));
    const onAbort = (): void => finish(() => reject(signal.reason));

    worker.on('message', onMessage);
    worker.on('error', onError);
    worker.on('exit', onExit);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}

export async function filterGrepPaths(
  paths: readonly string[], include: string, exclude: string, signal: AbortSignal,
): Promise<string[]> {
  signal.throwIfAborted();
  if (paths.length === 0 || (include === '' && exclude === '')) return [...paths];
  return runFilterWorker(startFilterWorker(paths, include, exclude), signal);
}
