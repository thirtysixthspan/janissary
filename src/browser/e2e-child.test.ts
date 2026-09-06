import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as NodeFs from 'node:fs';
import { E2E_LOOPBACK_HOST } from './e2e-loopback.js';
import { parseE2EBrowserArgs, runE2EBrowser, WS_PATH_ENV } from './e2e-child.js';

// `playwright` is stubbed: no Chromium starts in this suite, for the same reason none starts in
// `e2e-server.test.ts`. What a real browser proves is in the plan's manual checks.

const mocks = vi.hoisted(() => ({
  launchServer: vi.fn(),
  executablePath: vi.fn(() => '/pw/chrome-mac/Chromium'),
  writeSync: vi.fn(),
}));

vi.mock('playwright', () => ({
  chromium: { launchServer: mocks.launchServer, executablePath: mocks.executablePath },
}));

// Only `writeSync`, and only because the real one would write the browser's obituary onto the test
// runner's own stderr. Everything else in `node:fs` stays real.
vi.mock('node:fs', async (importOriginal) => ({
  ...await importOriginal<typeof NodeFs>(),
  writeSync: mocks.writeSync,
}));

type BrowserEnd = { exitCode: number | null; signalCode: NodeJS.Signals | null };

const STILL_RUNNING: BrowserEnd = { exitCode: null, signalCode: null };

function stubServer(end: BrowserEnd = STILL_RUNNING) {
  const handlers = new Map<string, () => void>();
  return {
    handlers,
    on: vi.fn((event: string, handler: () => void) => { handlers.set(event, handler); }),
    process: vi.fn(() => end),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.launchServer.mockResolvedValue(stubServer());
});

async function launchOptions(): Promise<Record<string, unknown>> {
  await runE2EBrowser({ port: 51_234, wsPath: '/internal-token', dir: '/ws/browsers/bot-token' });
  return mocks.launchServer.mock.calls[0][0] as Record<string, unknown>;
}

// Close the browser the way Playwright does and report what the wrapper said and exited with.
async function browserClosed(end: BrowserEnd): Promise<{ said: string; exitedWith: unknown }> {
  const server = stubServer(end);
  mocks.launchServer.mockResolvedValue(server);
  const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  try {
    await runE2EBrowser({ port: 51_234, wsPath: '/internal-token', dir: '/ws/browsers/bot-token' });
    server.handlers.get('close')?.();
    return { said: String(mocks.writeSync.mock.calls[0]?.[1] ?? ''), exitedWith: exit.mock.calls[0]?.[0] };
  } finally {
    exit.mockRestore();
  }
}

// The secret path travels in the environment, not the argument vector: `ps` publishes an argument
// vector to every user on a macOS host, and this token plus the port skips the guard entirely.
describe('parseE2EBrowserArgs', () => {
  const ARGV = ['--port', '51234', '--dir', '/ws/browsers/bot-token'];

  it('reads the ws path from the environment', () => {
    expect(parseE2EBrowserArgs(ARGV, { [WS_PATH_ENV]: '/internal-token' }))
      .toEqual({ port: 51_234, wsPath: '/internal-token', dir: '/ws/browsers/bot-token' });
  });

  it('fails, naming the variable, when it is absent', () => {
    const parsed = parseE2EBrowserArgs(ARGV, {});
    expect(parsed).toMatchObject({ error: expect.stringContaining(WS_PATH_ENV) });
  });

  // The old channel must not quietly keep working, or the disclosure comes back the moment a caller
  // is written against the previous shape.
  it('does not honour a --ws-path argument', () => {
    const parsed = parseE2EBrowserArgs([...ARGV, '--ws-path', '/from-argv'], {});
    expect(parsed).toMatchObject({ error: expect.stringContaining(WS_PATH_ENV) });
  });

  it('still reads the port and directory from the argument vector', () => {
    const parsed = parseE2EBrowserArgs(['--port', '1', '--dir', '/d'], { [WS_PATH_ENV]: '/p' });
    expect(parsed).toMatchObject({ port: 1, dir: '/d' });
  });

  it.each([['--port', '0'], ['--port', 'abc'], ['--port', '70000']])('rejects %s %s', (flag, value) => {
    const parsed = parseE2EBrowserArgs([flag, value, '--dir', '/d'], { [WS_PATH_ENV]: '/p' });
    expect(parsed).toMatchObject({ error: expect.stringContaining('--port') });
  });

  it('fails when the directory is missing', () => {
    const parsed = parseE2EBrowserArgs(['--port', '51234'], { [WS_PATH_ENV]: '/p' });
    expect(parsed).toMatchObject({ error: expect.stringContaining('--dir') });
  });
});

describe('runE2EBrowser listener address', () => {
  // Playwright's `host` defaults to the *name* `localhost`. The guard dials an address, so a host
  // that resolves that name to `::1` first would leave the browser listening where the guard never
  // looks — alive, unreachable, and with nothing to report.
  it('binds the address the guard dials rather than leaving the name to the resolver', async () => {
    const options = await launchOptions();
    expect(options.host).toBe(E2E_LOOPBACK_HOST);
  });

  it('binds loopback only, never a wildcard address', async () => {
    const options = await launchOptions();
    expect(options.host).not.toBe('0.0.0.0');
    expect(options.host).not.toBe('::');
  });
});

describe('runE2EBrowser launch options', () => {
  it('keeps the port and path it was given', async () => {
    const options = await launchOptions();
    expect(options.port).toBe(51_234);
    expect(options.wsPath).toBe('/internal-token');
  });

  it('stays headless, on Playwright\'s own binary, downloading into the scratch directory', async () => {
    const options = await launchOptions();
    expect(options.headless).toBe(true);
    expect(options.executablePath).toBe('/pw/chrome-mac/Chromium');
    expect(options.downloadsPath).toBe('/ws/browsers/bot-token/downloads');
  });
});

// The wrapper used to exit silently and with code 0 however Chromium went, so a browser killed by
// the OS and one shut down gracefully produced the same notification: the message and nothing else.
describe('runE2EBrowser reporting how the browser went', () => {
  it('names the signal that killed Chromium and exits non-zero', async () => {
    const { said, exitedWith } = await browserClosed({ exitCode: null, signalCode: 'SIGKILL' });
    expect(said).toBe('chromium exited (signal SIGKILL)\n');
    expect(exitedWith).toBe(1);
  });

  it('names a non-zero exit code and exits non-zero', async () => {
    const { said, exitedWith } = await browserClosed({ exitCode: 1, signalCode: null });
    expect(said).toBe('chromium exited (code 1)\n');
    expect(exitedWith).toBe(1);
  });

  // A clean shutdown has to be positively distinguishable from a death, or the report is back to
  // being the absence of a clue.
  it('says so, and exits zero, when Chromium shut down cleanly', async () => {
    const { said, exitedWith } = await browserClosed({ exitCode: 0, signalCode: null });
    expect(said).toBe('chromium exited (code 0)\n');
    expect(exitedWith).toBe(0);
  });

  it('exits non-zero when the platform reported no status at all', async () => {
    const { exitedWith } = await browserClosed({ exitCode: null, signalCode: null });
    expect(exitedWith).toBe(1);
  });

  // A pipe write is asynchronous on macOS, so a queued `process.stderr.write` would still be queued
  // when the exit took the process down. The blocking write to fd 2 is what the parent gets to read.
  it('writes the line to fd 2 with a blocking write before it exits', async () => {
    await browserClosed({ exitCode: null, signalCode: 'SIGSEGV' });
    expect(mocks.writeSync).toHaveBeenCalledTimes(1);
    expect(mocks.writeSync.mock.calls[0][0]).toBe(2);
  });

  it('says nothing at all while the browser is still running', async () => {
    await runE2EBrowser({ port: 51_234, wsPath: '/internal-token', dir: '/ws/browsers/bot-token' });
    expect(mocks.writeSync).not.toHaveBeenCalled();
  });
});
