import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type * as workerThreads from 'node:worker_threads';
import { Worker } from 'node:worker_threads';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { filterPaths } from '../search/filter-paths.js';
import { workerExecArgv } from '../search/matching-worker.js';
import { filterGrepPaths, grepFilterWorkerEntry } from './filter-worker.js';

type WorkerFactory = (url: URL, options: workerThreads.WorkerOptions) => unknown | undefined;

const control = vi.hoisted(() => ({
  factory: null as WorkerFactory | null,
  calls: [] as { url: URL; options: workerThreads.WorkerOptions }[],
  created: [] as unknown[],
}));

vi.mock('node:worker_threads', async (importOriginal) => {
  const actual = await importOriginal<typeof workerThreads>();
  const Worker = vi.fn(function (url: URL, options: workerThreads.WorkerOptions) {
    control.calls.push({ url, options });
    const fake = control.factory?.(url, options);
    if (fake !== undefined) {
      control.created.push(fake);
      return fake;
    }
    const worker = new actual.Worker(url, options);
    control.created.push(worker);
    return worker;
  });
  return { ...actual, Worker };
});

const actualWorkerThreads = await vi.importActual<typeof workerThreads>('node:worker_threads');

type Listener = (value: unknown) => void;

class FakeWorker {
  private readonly listeners = new Map<string, Listener[]>();
  termination: Promise<number> = Promise.resolve(0);
  readonly terminate = vi.fn(() => this.termination);

  on(event: string, listener: Listener): this {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(listener);
    this.listeners.set(event, listeners);
    return this;
  }

  off(event: string, listener: Listener): this {
    const listeners = this.listeners.get(event) ?? [];
    this.listeners.set(event, listeners.filter((entry) => entry !== listener));
    return this;
  }

  emit(event: string, value: unknown): void {
    const listeners = this.listeners.get(event) ?? [];
    for (const listener of listeners) listener(value);
  }

  reply(response: unknown): void {
    this.emit('message', response);
  }

  fail(error: Error): void {
    this.emit('error', error);
  }

  exit(code: number): void {
    this.emit('exit', code);
  }

  listenerCount(event: string): number {
    return (this.listeners.get(event) ?? []).length;
  }
}

function activate(fake: FakeWorker): FakeWorker {
  control.factory = () => fake;
  return fake;
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function expectReleased(fake: FakeWorker): void {
  expect(fake.listenerCount('message')).toBe(0);
  expect(fake.listenerCount('error')).toBe(0);
  expect(fake.listenerCount('exit')).toBe(0);
}

function expectTerminatedOnce(fake: FakeWorker): void {
  expect(fake.terminate).toHaveBeenCalledOnce();
}

beforeEach(() => {
  control.factory = null;
  control.calls = [];
  control.created = [];
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('filter worker adapter', () => {
  it('forwards the request and returns the unchanged filter result', async () => {
    const fake = activate(new FakeWorker());
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const paths = ['b.ts', 'a.md', 'src/c.ts'];
    const pending = filterGrepPaths(paths, '*.ts', '', controller.signal);

    expect(control.calls).toHaveLength(1);
    const [{ url, options }] = control.calls;
    expect(url.pathname.endsWith('/src/file-grep/filter-worker-entry.ts')).toBe(true);
    expect(options.workerData).toEqual({ paths: ['b.ts', 'a.md', 'src/c.ts'], include: '*.ts', exclude: '' });

    fake.reply({ paths: ['b.ts', 'src/c.ts'] });
    await expect(pending).resolves.toEqual(['b.ts', 'src/c.ts']);
    expect(filterPaths(paths, '*.ts', '')).toEqual(['b.ts', 'src/c.ts']);
    expectTerminatedOnce(fake);
    await flush();
    expectReleased(fake);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('copies the paths without a worker when both fields are exactly empty', async () => {
    const paths = ['a.ts', 'b.md'];
    const result = await filterGrepPaths(paths, '', '', new AbortController().signal);
    expect(result).toEqual(paths);
    expect(result).not.toBe(paths);
    expect(control.calls).toHaveLength(0);
  });

  it('copies an empty path list without a worker', async () => {
    await expect(filterGrepPaths([], '*.ts', '', new AbortController().signal)).resolves.toEqual([]);
    expect(control.calls).toHaveLength(0);
  });

  it('uses the source entry beside a TypeScript module', () => {
    expect(grepFilterWorkerEntry('file:///repo/src/file-grep/filter-worker.ts').pathname)
      .toBe('/repo/src/file-grep/filter-worker-entry.ts');
  });

  it('uses the compiled entry beside a JavaScript module', () => {
    expect(grepFilterWorkerEntry('file:///repo/dist/file-grep/filter-worker.js').pathname)
      .toBe('/repo/dist/file-grep/filter-worker-entry.js');
  });

  it('loads its TypeScript entry on a Node version where tsx registers only on the main thread', async () => {
    const pinNode = "Object.defineProperty(process.versions, 'node', { value: '24.10.0' });";
    control.factory = (url, options) => new actualWorkerThreads.Worker(url, {
      ...options,
      execArgv: ['--import', `data:text/javascript,${encodeURIComponent(pinNode)}`, ...(options.execArgv ?? [])],
    });
    await expect(filterGrepPaths(['a.ts', 'b.md'], '*.ts', '', new AbortController().signal)).resolves.toEqual(['a.ts']);
  }, 10_000);

  it('loads its TypeScript entry when the working directory resolves a different tsx', async () => {
    const project = mkdtempSync(path.join(tmpdir(), 'file-grep-filter-cwd-'));
    const stub = path.join(project, 'node_modules', 'tsx');
    mkdirSync(stub, { recursive: true });
    writeFileSync(path.join(stub, 'package.json'), JSON.stringify({ name: 'tsx', type: 'module', exports: './noop.mjs' }));
    writeFileSync(path.join(stub, 'noop.mjs'), '');
    const previous = process.cwd();
    process.chdir(project);
    try {
      await expect(filterGrepPaths(['a.ts'], '*.ts', '', new AbortController().signal)).resolves.toEqual(['a.ts']);
    } finally {
      process.chdir(previous);
      rmSync(project, { recursive: true, force: true });
    }
  }, 10_000);

  it('propagates a worker constructor throw unchanged', async () => {
    const failure = new Error('worker constructor exploded');
    control.factory = () => {
      throw failure;
    };
    await expect(filterGrepPaths(['a.ts'], '*.ts', '', new AbortController().signal)).rejects.toBe(failure);
    expect(control.created).toHaveLength(0);
  });

  it('propagates a worker error unchanged', async () => {
    const fake = activate(new FakeWorker());
    const failure = new Error('worker crashed');
    const pending = filterGrepPaths(['a.ts'], '*.ts', '', new AbortController().signal);
    fake.fail(failure);
    await expect(pending).rejects.toBe(failure);
    expectTerminatedOnce(fake);
    await flush();
    expectReleased(fake);
  });

  it('rejects a premature nonzero exit', async () => {
    const fake = activate(new FakeWorker());
    const pending = filterGrepPaths(['a.ts'], '*.ts', '', new AbortController().signal);
    fake.exit(7);
    await expect(pending).rejects.toThrow('File grep filter worker exited with code 7');
    expectTerminatedOnce(fake);
    await flush();
    expectReleased(fake);
  });

  it('rejects a malformed response', async () => {
    const fake = activate(new FakeWorker());
    const pending = filterGrepPaths(['a.ts'], '*.ts', '', new AbortController().signal);
    fake.reply({ paths: ['a.ts', 2] });
    await expect(pending).rejects.toThrow('File grep filter worker sent an invalid response');
    expectTerminatedOnce(fake);
    await flush();
    expectReleased(fake);
  });

  it('rejects with the exact abort reason and terminates a pending worker', async () => {
    const fake = activate(new FakeWorker());
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const reason = new Error('cancel the filter');
    const pending = filterGrepPaths(['a.ts'], '*.ts', '', controller.signal);
    controller.abort(reason);
    await expect(pending).rejects.toBe(reason);
    expectTerminatedOnce(fake);
    await flush();
    expectReleased(fake);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('ignores late values and errors until termination completes', async () => {
    const fake = activate(new FakeWorker());
    const termination = Promise.withResolvers<number>();
    fake.termination = termination.promise;
    const pending = filterGrepPaths(['a.ts'], '*.ts', '', new AbortController().signal);
    fake.reply({ paths: ['a.ts'] });
    await expect(pending).resolves.toEqual(['a.ts']);

    fake.reply({ paths: ['late.ts'] });
    fake.fail(new Error('late worker failure'));
    fake.exit(1);
    await flush();
    expect(fake.listenerCount('error')).toBe(1);
    expectTerminatedOnce(fake);

    termination.resolve(0);
    await flush();
    expectReleased(fake);
  });

  it('observes a termination rejection without replacing the success', async () => {
    const fake = activate(new FakeWorker());
    const termination = Promise.withResolvers<number>();
    fake.termination = termination.promise;
    const pending = filterGrepPaths(['a.ts'], '*.ts', '', new AbortController().signal);
    fake.reply({ paths: ['a.ts'] });
    await expect(pending).resolves.toEqual(['a.ts']);
    termination.reject(new Error('termination failed'));
    await flush();
    expectTerminatedOnce(fake);
    expectReleased(fake);
  });
});

function startEntry(payload: unknown): workerThreads.Worker {
  const moduleUrl = new URL('filter-worker.ts', import.meta.url).href;
  return new Worker(grepFilterWorkerEntry(moduleUrl), {
    workerData: payload,
    execArgv: workerExecArgv(moduleUrl),
  });
}

async function entryFailure(payload: unknown): Promise<Error> {
  const worker = startEntry(payload);
  try {
    return await new Promise<Error>((resolve, reject) => {
      worker.once('error', resolve);
      worker.once('exit', (code) => reject(new Error(`worker exited before its error: ${code}`)));
    });
  } finally {
    await worker.terminate();
  }
}

describe('filter worker entry guards', () => {
  it('rejects a null request payload', async () => {
    const error = await entryFailure(null);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('File grep filter request is invalid');
  }, 10_000);

  it('rejects a non-string path element', async () => {
    const error = await entryFailure({ paths: ['a.ts', 2], include: '', exclude: '' });
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('File grep filter request is invalid');
  }, 10_000);

  it('rejects a non-string include field', async () => {
    const error = await entryFailure({ paths: [], include: 1, exclude: '' });
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('File grep filter request is invalid');
  }, 10_000);

  it('rejects a non-string exclude field', async () => {
    const error = await entryFailure({ paths: [], include: '', exclude: true });
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('File grep filter request is invalid');
  }, 10_000);
});

async function runHostile(
  filename: string, include: string, exclude: string, expected: string[],
): Promise<void> {
  const started = Date.now();
  let timerRan = false;
  const timer = setTimeout(() => {
    timerRan = true;
  }, 10);
  try {
    // filterPaths now shares file glob's matcher, so its complexity guard and literal-extglob rules
    // refuse a hostile pattern in an ordinary fast match. The worker settles on its own and the
    // parent event loop stays responsive without needing an abort.
    await expect(filterGrepPaths([filename], include, exclude, new AbortController().signal))
      .resolves.toEqual(expected);
    expect(timerRan).toBe(true);
    expect(Date.now() - started).toBeLessThan(2000);
    await flush();
  } finally {
    clearTimeout(timer);
  }
}

describe('hostile glob responsiveness', () => {
  const plusPattern = '+(a|aa)b';
  const plusName = `${'a'.repeat(100)}c`;
  const starPattern = `${'*a'.repeat(12)}b`;
  const starName = `${'a'.repeat(200)}c`;

  it('refuses a hostile include extglob without blocking the parent and recovers', async () => {
    await runHostile(plusName, plusPattern, '', []);
    await expect(filterGrepPaths(['a.ts', 'b.md'], '*.ts', '', new AbortController().signal)).resolves.toEqual(['a.ts']);
  }, 10_000);

  it('refuses a hostile exclude extglob without blocking the parent', async () => {
    await runHostile(plusName, '', plusPattern, [plusName]);
  }, 10_000);

  it('refuses a hostile include with repeated stars without blocking the parent', async () => {
    await runHostile(starName, starPattern, '', []);
  }, 10_000);

  it('refuses a hostile exclude with repeated stars without blocking the parent', async () => {
    await runHostile(starName, '', starPattern, [starName]);
  }, 10_000);
});
