import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMatcherWorker, MatcherDeadlineError, workerEntry, workerExecArgv } from './matching-worker.js';
import type { MatcherWorkerRequest, MatcherWorkerResponse } from './matcher-worker-protocol.js';

type EventName = 'message' | 'error' | 'exit';
type Listener = (value: unknown) => void;

class FakeWorker {
  readonly posted: MatcherWorkerRequest[] = [];
  readonly terminate = vi.fn(async () => 0);
  private readonly listeners = new Map<EventName, Listener[]>();

  on(event: EventName, listener: Listener): this {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(listener);
    this.listeners.set(event, listeners);
    return this;
  }

  postMessage(message: MatcherWorkerRequest): void {
    this.posted.push(message);
  }

  reply(response: MatcherWorkerResponse): void {
    const listeners = this.listeners.get('message') ?? [];
    for (const listener of listeners) listener(response);
  }

  fail(error: Error): void {
    const listeners = this.listeners.get('error') ?? [];
    for (const listener of listeners) listener(error);
  }

  exit(code: number): void {
    const listeners = this.listeners.get('exit') ?? [];
    for (const listener of listeners) listener(code);
  }
}

const modes = { regex: false, matchCase: false, wholeWord: false };

afterEach(() => {
  vi.useRealTimers();
});

async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) return error;
    throw error;
  }
  throw new Error('expected the promise to reject');
}

describe('matcher worker adapter', () => {
  it('uses matching worker entries beside source and compiled modules', () => {
    expect(workerEntry('file:///repo/src/search/matching-worker.ts').pathname)
      .toBe('/repo/src/search/matcher-worker-entry.ts');
    expect(workerEntry('file:///repo/dist/search/matching-worker.js').pathname)
      .toBe('/repo/dist/search/matcher-worker-entry.js');
  });

  it('terminates on a job deadline, settles all pending jobs, and ignores late replies', async () => {
    vi.useFakeTimers();
    const fake = new FakeWorker();
    const controller = new AbortController();
    const matcher = createMatcherWorker('todo', modes, controller.signal, {
      deadlineMs: 10, createWorker: () => fake,
    });
    const first = rejection(matcher.detect(['todo']));
    const second = rejection(matcher.rows('a.ts', 'todo'));
    await vi.advanceTimersByTimeAsync(10);
    const [firstReason, secondReason] = await Promise.all([first, second]);

    expect(firstReason).toBeInstanceOf(Error);
    expect(firstReason).toBeInstanceOf(MatcherDeadlineError);
    expect(firstReason.message).toBe('Search matching exceeded its 10 ms deadline');
    expect(secondReason).toBe(firstReason);
    expect(fake.terminate).toHaveBeenCalledOnce();
    expect(fake.posted.map((message) => message.id)).toEqual([1, 2]);

    await expect(matcher.detect(['todo'])).rejects.toBe(firstReason);
    expect(fake.posted.map((message) => message.id)).toEqual([1, 2]);

    fake.reply({ id: 1, result: true });
    controller.abort();
    fake.exit(1);
    matcher.dispose();
    expect(fake.terminate).toHaveBeenCalledOnce();
    await expect(matcher.rows('a.ts', 'todo')).rejects.toBe(firstReason);
  });

  it('keeps a pending job unsettled until the default 1000 ms deadline fires', async () => {
    vi.useFakeTimers();
    const fake = new FakeWorker();
    const matcher = createMatcherWorker('todo', modes, new AbortController().signal, {
      createWorker: () => fake,
    });
    let settled = false;
    const pending = matcher.detect(['todo']);
    const outcome = (async () => {
      const reason = await rejection(pending);
      settled = true;
      return reason;
    })();

    await vi.advanceTimersByTimeAsync(999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const reason = await outcome;

    expect(settled).toBe(true);
    expect(reason).toBeInstanceOf(MatcherDeadlineError);
    expect(reason.message).toBe('Search matching exceeded its 1000 ms deadline');
    matcher.dispose();
  });

  it('terminates and settles a pending job when its signal is cancelled', async () => {
    const fake = new FakeWorker();
    const controller = new AbortController();
    const matcher = createMatcherWorker('todo', modes, controller.signal, {
      createWorker: () => fake,
    });
    const result = matcher.detect(['todo']);
    controller.abort();

    const reason = await rejection(result);
    expect(reason).toBeInstanceOf(Error);
    expect(reason).not.toBeInstanceOf(MatcherDeadlineError);
    expect(reason.message).toBe('Search matching cancelled');
    expect(fake.terminate).toHaveBeenCalledOnce();
    fake.reply({ id: 1, result: true });
    await expect(matcher.detect(['todo'])).rejects.toBe(reason);
  });

  it('settles a pending job with an ordinary cancellation error when disposed before its deadline', async () => {
    vi.useFakeTimers();
    const fake = new FakeWorker();
    const matcher = createMatcherWorker('todo', modes, new AbortController().signal, {
      deadlineMs: 10, createWorker: () => fake,
    });
    const result = rejection(matcher.detect(['todo']));
    matcher.dispose();

    const reason = await result;
    expect(reason).toBeInstanceOf(Error);
    expect(reason).not.toBeInstanceOf(MatcherDeadlineError);
    expect(reason.message).toBe('Search matching cancelled');

    await vi.advanceTimersByTimeAsync(10);
    expect(fake.terminate).toHaveBeenCalledOnce();
  });

  it('reports a worker failure that happens before the first job', async () => {
    const fake = new FakeWorker();
    const matcher = createMatcherWorker('todo', modes, new AbortController().signal, {
      createWorker: () => fake,
    });
    const failure = new Error('worker failed to load');
    fake.fail(failure);

    const reason = await rejection(matcher.detect(['todo']));
    expect(reason).toBe(failure);
    expect(reason).not.toBeInstanceOf(MatcherDeadlineError);
    await expect(matcher.rows('a.ts', 'todo')).rejects.toBe(failure);
    expect(fake.posted).toEqual([]);
    expect(fake.terminate).toHaveBeenCalledOnce();
  });

  it('rejects pending work with the original error when the worker fails', async () => {
    const fake = new FakeWorker();
    const matcher = createMatcherWorker('todo', modes, new AbortController().signal, {
      createWorker: () => fake,
    });
    const pending = rejection(matcher.detect(['todo']));
    const failure = new Error('worker crashed');
    fake.fail(failure);

    const reason = await pending;
    expect(reason).toBe(failure);
    expect(reason).not.toBeInstanceOf(MatcherDeadlineError);
    expect(fake.terminate).toHaveBeenCalledOnce();
    await expect(matcher.rows('a.ts', 'todo')).rejects.toBe(failure);
    expect(fake.posted).toHaveLength(1);
  });

  it('reports an unsolicited worker exit with its code', async () => {
    const fake = new FakeWorker();
    const matcher = createMatcherWorker('todo', modes, new AbortController().signal, {
      createWorker: () => fake,
    });
    const pending = rejection(matcher.rows('a.ts', 'todo'));
    fake.exit(7);

    const reason = await pending;
    expect(reason).toBeInstanceOf(Error);
    expect(reason).not.toBeInstanceOf(MatcherDeadlineError);
    expect(reason.message).toBe('Search matching worker exited with code 7');
    expect(fake.terminate).toHaveBeenCalledOnce();
    await expect(matcher.detect(['todo'])).rejects.toBe(reason);
    expect(fake.posted).toHaveLength(1);
  });

  it('rejects only the job a worker response reports an error for', async () => {
    const fake = new FakeWorker();
    const matcher = createMatcherWorker('todo', modes, new AbortController().signal, {
      createWorker: () => fake,
    });
    const failed = rejection(matcher.rows('a.ts', 'todo'));
    fake.reply({ id: 1, error: 'matcher exploded' });

    const reason = await failed;
    expect(reason).toBeInstanceOf(Error);
    expect(reason).not.toBeInstanceOf(MatcherDeadlineError);
    expect(reason.message).toBe('matcher exploded');
    expect(fake.terminate).not.toHaveBeenCalled();

    const next = matcher.detect(['todo']);
    fake.reply({ id: 2, result: true });
    await expect(next).resolves.toBe(true);
    expect(fake.terminate).not.toHaveBeenCalled();
    matcher.dispose();
    expect(fake.terminate).toHaveBeenCalledOnce();
  });

  it('keeps the parent responsive during expensive matching and permits a later query', async () => {
    const controller = new AbortController();
    const slow = createMatcherWorker('(a+)+$', { ...modes, regex: true }, controller.signal, {
      deadlineMs: 150,
    });
    let parentTimerRan = false;
    const timer = setTimeout(() => { parentTimerRan = true; }, 10);
    const expensive = slow.detect([`${'a'.repeat(32)}!`]);
    const reason = await rejection(expensive);
    expect(reason).toBeInstanceOf(MatcherDeadlineError);
    expect(reason.message).toBe('Search matching exceeded its 150 ms deadline');
    clearTimeout(timer);
    expect(parentTimerRan).toBe(true);

    const next = createMatcherWorker('todo', modes, new AbortController().signal);
    await expect(next.detect(['todo'])).resolves.toBe(true);
    next.dispose();
  }, 5000);

  it('loads its TypeScript entry on a Node version where tsx registers only on the main thread', async () => {
    const pinNode = "Object.defineProperty(process.versions, 'node', { value: '24.10.0' });";
    const moduleUrl = new URL('matching-worker.ts', import.meta.url).href;
    const execArgv = ['--import', `data:text/javascript,${encodeURIComponent(pinNode)}`, ...workerExecArgv(moduleUrl)];
    const matcher = createMatcherWorker('todo', modes, new AbortController().signal, {
      createWorker: () => new Worker(workerEntry(moduleUrl), { execArgv }),
    });
    await expect(matcher.detect(['todo'])).resolves.toBe(true);
    matcher.dispose();
  }, 5000);

  it('loads its TypeScript entry when the working directory resolves a different tsx', async () => {
    const project = mkdtempSync(path.join(tmpdir(), 'search-worker-cwd-'));
    const stub = path.join(project, 'node_modules', 'tsx');
    mkdirSync(stub, { recursive: true });
    writeFileSync(path.join(stub, 'package.json'), JSON.stringify({ name: 'tsx', type: 'module', exports: './noop.mjs' }));
    writeFileSync(path.join(stub, 'noop.mjs'), '');
    const previous = process.cwd();
    process.chdir(project);
    try {
      const matcher = createMatcherWorker('todo', modes, new AbortController().signal);
      await expect(matcher.detect(['todo'])).resolves.toBe(true);
      matcher.dispose();
    } finally {
      process.chdir(previous);
      rmSync(project, { recursive: true, force: true });
    }
  }, 5000);
});
