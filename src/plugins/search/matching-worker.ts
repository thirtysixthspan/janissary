import { Worker } from 'node:worker_threads';
import type { MatcherModes } from './compile-matcher.js';
import type {
  MatcherWorker, MatcherWorkerRequest, MatcherWorkerResponse,
} from './matcher-worker-protocol.js';
import type { SearchMatch } from './shared.js';

export const MATCHING_JOB_DEADLINE_MS = 1000;

type WorkerPort = {
  on(event: 'message', listener: (message: unknown) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  on(event: 'exit', listener: (code: number) => void): unknown;
  postMessage(message: MatcherWorkerRequest): void;
  terminate(): Promise<number>;
};

type Pending = {
  resolve(response: MatcherWorkerResponse): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
};

export type MatcherWorkerOptions = {
  deadlineMs?: number;
  createWorker?: () => WorkerPort;
};

export function workerEntry(moduleUrl: string): URL {
  const source = moduleUrl.endsWith('.ts');
  return new URL(source ? './matcher-worker-entry.ts' : './matcher-worker-entry.js', moduleUrl);
}

function defaultWorker(): WorkerPort {
  const entry = workerEntry(import.meta.url);
  const source = import.meta.url.endsWith('.ts');
  return new Worker(entry, { execArgv: source ? ['--import', 'tsx'] : [] });
}

export function createMatcherWorker(
  query: string, modes: MatcherModes, signal: AbortSignal, options: MatcherWorkerOptions = {},
): MatcherWorker {
  const worker = (options.createWorker ?? defaultWorker)();
  const deadline = options.deadlineMs ?? MATCHING_JOB_DEADLINE_MS;
  const pending = new Map<number, Pending>();
  let nextId = 0;
  let closed = false;

  const rejectPending = (error: Error) => {
    for (const job of pending.values()) {
      clearTimeout(job.timer);
      job.reject(error);
    }
    pending.clear();
  };

  const terminate = (reason: Error) => {
    if (closed) return;
    closed = true;
    signal.removeEventListener('abort', cancel);
    rejectPending(reason);
    void worker.terminate();
  };

  const cancel = () => terminate(new Error('Search matching cancelled'));
  signal.addEventListener('abort', cancel, { once: true });
  worker.on('message', (message) => {
    if (!isResponse(message)) return;
    const job = pending.get(message.id);
    if (job === undefined) return;
    clearTimeout(job.timer);
    pending.delete(message.id);
    if ('error' in message) job.reject(new Error(message.error));
    else job.resolve(message);
  });
  worker.on('error', (error) => terminate(error));
  worker.on('exit', (code) => {
    if (!closed) terminate(new Error(`Search matching worker exited with code ${code}`));
  });

  const request = (
    build: (id: number) => MatcherWorkerRequest,
  ): Promise<MatcherWorkerResponse> => new Promise((resolve, reject) => {
    if (closed || signal.aborted) {
      reject(new Error('Search matching cancelled'));
      return;
    }
    const id = ++nextId;
    const timer = setTimeout(() => {
      terminate(new Error(`Search matching exceeded its ${deadline} ms deadline`));
    }, deadline);
    pending.set(id, { resolve, reject, timer });
    worker.postMessage(build(id));
  });

  return {
    detect: async (lines) => {
      const response = await request((id) => ({ id, query, modes, operation: 'detect', lines }));
      return 'result' in response && response.result === true;
    },
    rows: async (relPath, text) => {
      const response = await request((id) => ({ id, query, modes, operation: 'rows', relPath, text }));
      return 'result' in response && isRows(response.result) ? response.result : [];
    },
    dispose: () => terminate(new Error('Search matching cancelled')),
  };
}

function isRows(value: boolean | SearchMatch[]): value is SearchMatch[] {
  return Array.isArray(value);
}

function isResponse(value: unknown): value is MatcherWorkerResponse {
  if (typeof value !== 'object' || value === null || !('id' in value)) return false;
  return typeof value.id === 'number' && ('error' in value || 'result' in value);
}
