import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { describe, expect, it, vi } from 'vitest';
import { createMatcherWorker, workerEntry, workerExecArgv } from './matching-worker.js';
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
}

const modes = { regex: false, matchCase: false, wholeWord: false };

describe('matcher worker adapter', () => {
  it('uses matching worker entries beside source and compiled modules', () => {
    expect(workerEntry('file:///repo/src/search/matching-worker.ts').pathname)
      .toBe('/repo/src/search/matcher-worker-entry.ts');
    expect(workerEntry('file:///repo/dist/search/matching-worker.js').pathname)
      .toBe('/repo/dist/search/matcher-worker-entry.js');
  });

  it('terminates on a job deadline, settles all pending jobs, and ignores late replies', async () => {
    const fake = new FakeWorker();
    const matcher = createMatcherWorker('todo', modes, new AbortController().signal, {
      deadlineMs: 10, createWorker: () => fake,
    });
    const first = matcher.detect(['todo']);
    const second = matcher.rows('a.ts', 'todo');
    const results = await Promise.allSettled([first, second]);

    expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected']);
    expect(fake.terminate).toHaveBeenCalledOnce();
    expect(fake.posted.map((message) => message.id)).toEqual([1, 2]);
    fake.reply({ id: 1, result: true });
    matcher.dispose();
    expect(fake.terminate).toHaveBeenCalledOnce();
  });

  it('terminates and settles a pending job when its signal is cancelled', async () => {
    const fake = new FakeWorker();
    const controller = new AbortController();
    const matcher = createMatcherWorker('todo', modes, controller.signal, {
      createWorker: () => fake,
    });
    const result = matcher.detect(['todo']);
    controller.abort();

    await expect(result).rejects.toThrow('cancelled');
    expect(fake.terminate).toHaveBeenCalledOnce();
    fake.reply({ id: 1, result: true });
  });

  it('reports a worker failure that happens before the first job', async () => {
    const fake = new FakeWorker();
    const matcher = createMatcherWorker('todo', modes, new AbortController().signal, {
      createWorker: () => fake,
    });
    fake.fail(new Error('worker failed to load'));

    await expect(matcher.detect(['todo'])).rejects.toThrow('worker failed to load');
    await expect(matcher.rows('a.ts', 'todo')).rejects.toThrow('worker failed to load');
    expect(fake.posted).toEqual([]);
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
    await expect(expensive).rejects.toThrow('deadline');
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
