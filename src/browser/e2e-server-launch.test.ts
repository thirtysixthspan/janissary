import { existsSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { E2E_LOOPBACK_HOST } from './e2e-loopback.js';
import {
  e2eServerMocks, guardCall, internalPath, internalPort, resetE2EServerFixture, start,
} from './e2e-server-test-fixture.js';

const mocks = e2eServerMocks();
beforeEach(resetE2EServerFixture);

describe('startE2EBrowserServer environment', () => {
  it('publishes the guard\'s endpoint and never the browser\'s own', async () => {
    const { env } = await start();
    const endpoint = env.JANISSARY_BROWSER_WS_ENDPOINT ?? '';
    expect(endpoint).toBe(`ws://127.0.0.1:${guardCall().port}${guardCall().wsPath}`);
    expect(endpoint).not.toContain(internalPath());
    expect(endpoint).not.toContain(String(internalPort()));
  });

  it('mints two distinct unguessable paths', async () => {
    await start();
    expect(guardCall().wsPath).not.toBe(internalPath());
    expect(guardCall().wsPath.length).toBeGreaterThan(24);
    expect(internalPath().length).toBeGreaterThan(24);
  });

  it('names the shared loopback address in the endpoint it hands the agent', async () => {
    const { env } = await start();
    const endpoint = env.JANISSARY_BROWSER_WS_ENDPOINT ?? '';
    expect(endpoint.startsWith(`ws://${E2E_LOOPBACK_HOST}:`)).toBe(true);
  });

  it('resolves JANISSARY_PLAYWRIGHT to the package entry the server is running', async () => {
    const { env } = await start();
    expect(env.JANISSARY_PLAYWRIGHT).toBe('/app/node_modules/playwright/index.js');
  });

  it('carries exactly the two variables', async () => {
    const { env } = await start();
    const names = Object.keys(env).toSorted((a, b) => a.localeCompare(b));
    expect(names).toEqual(['JANISSARY_BROWSER_WS_ENDPOINT', 'JANISSARY_PLAYWRIGHT']);
  });

  // The whole difference between the two entry points: this one asks for a browser rather than
  // leaving it to the first connect, and it does so through the same supplier a connect would use.
  it('starts a browser without being asked, which the lazy entry point never does', async () => {
    await start();
    expect(mocks.allocateBrowserScratch).toHaveBeenCalledTimes(1);
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    expect(internalPort()).not.toBe(guardCall().port);
  });
});

describe('startE2EBrowserServer ports', () => {
  it('never points the guard at its own listening port', async () => {
    await start();
    expect(guardCall().port).not.toBe(internalPort());
  });

  it('keeps the private browser port out of the harness environment', async () => {
    const server = await start();
    expect(Object.values(server.env)).not.toContain(String(internalPort()));
    expect(server).not.toHaveProperty('browserPort');
  });

  it('reports a full band through onGone and hands back no browser variables', async () => {
    mocks.portsThrow = 'no free e2e browser port between 65280 and 65535';
    const server = await start();
    expect(server.onGone).toHaveBeenCalledTimes(1);
    expect(String(server.onGone.mock.calls[0][0])).toContain('no free e2e browser port');
    expect(server.env).toEqual({});
    expect(mocks.startE2EGuard).not.toHaveBeenCalled();
    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(() => server.handle.close()).not.toThrow();
  });

  it('gives two live browsers four distinct ports', async () => {
    const first = await start();
    const second = await start();
    const ports = [guardCall(0).port, internalPort(0), guardCall(1).port, internalPort(1)];
    expect(new Set(ports).size).toBe(4);
    first.handle.close();
    second.handle.close();
  });

  it('frees only the closed browser\'s ports', async () => {
    const first = await start();
    const second = await start();
    first.handle.close();
    const third = await start();
    const stillLive = [guardCall(1).port, internalPort(1)];
    expect(stillLive).not.toContain(guardCall(2).port);
    expect(stillLive).not.toContain(internalPort(2));
    second.handle.close();
    third.handle.close();
  });
});

describe('startE2EBrowserServer workspace', () => {
  it('allocates its scratch directory rather than deriving one from the label', async () => {
    await start();
    expect(mocks.allocateBrowserScratch).toHaveBeenCalledTimes(1);
    expect(mocks.allocateBrowserScratch).toHaveBeenCalledWith('bot');
  });

  it('confines the child with the browser profile against that workspace', async () => {
    await start();
    const [options] = mocks.sandboxSpawn.mock.calls[0] as [{ workspaceDir: string; browser: { chromiumDir: string } }];
    expect(options.workspaceDir).toBe('/ws/browsers/bot-token');
    expect(options.browser.chromiumDir).toBe('/pw/Chrome.app');
  });

  it('names the code tree the launch resolved, not the installation root', async () => {
    await start();
    const [options] = mocks.sandboxSpawn.mock.calls[0] as [{ browser: { appDir: string; appEntryDir: string; playwrightDirs: string[] } }];
    const [, args] = mocks.spawn.mock.calls[0] as [string, string[]];
    const entry = args[args.indexOf('e2e-browser') - 1];
    expect(options.browser.appEntryDir).toBe(path.dirname(entry));
    expect(options.browser.appEntryDir).not.toBe(options.browser.appDir);
    expect(options.browser.playwrightDirs).toEqual([
      '/app/node_modules/playwright', '/app/node_modules/playwright-core',
    ]);
  });

  it('points the child\'s temp variables at the allocated temp sibling', async () => {
    await start();
    const spawnOptions = (mocks.spawn.mock.calls[0] as [string, string[], { env: NodeJS.ProcessEnv }])[2];
    // TMPDIR for Playwright's own temp dirs, MAC_CHROMIUM_TMPDIR because Chromium's macOS temp
    // resolution ignores TMPDIR entirely — see the env construction in e2e-spawn.ts.
    expect(spawnOptions.env.TMPDIR).toBe('/ws/browsers/bot-token.tmp');
    expect(spawnOptions.env.MAC_CHROMIUM_TMPDIR).toBe('/ws/browsers/bot-token.tmp');
  });

  it('starts the child inside its readable scratch directory', async () => {
    await start();
    const spawnOptions = (mocks.spawn.mock.calls[0] as [string, string[], { cwd: string }])[2];
    expect(spawnOptions.cwd).toBe('/ws/browsers/bot-token');
  });

  it('passes the child the internal port and directory, not the published ones', async () => {
    await start();
    const args = (mocks.spawn.mock.calls[0] as [string, string[]])[1];
    expect(args).toContain('e2e-browser');
    expect(args[args.indexOf('--port') + 1]).toBe(String(internalPort()));
    expect(args[args.indexOf('--dir') + 1]).toBe('/ws/browsers/bot-token');
  });

  it('keeps the internal path out of the child\'s argument vector', async () => {
    await start();
    const [command, args] = mocks.spawn.mock.calls[0] as [string, string[]];
    expect([command, ...args].join(' ')).not.toContain(internalPath());
  });

  it('hands the internal path to the child in its environment instead', async () => {
    await start();
    const spawnOptions = (mocks.spawn.mock.calls[0] as [string, string[], { env: NodeJS.ProcessEnv }])[2];
    expect(spawnOptions.env.JANISSARY_E2E_WS_PATH).toBe(internalPath());
  });
});

describe('startE2EBrowserServer child launch', () => {
  function spawnCall() {
    return mocks.spawn.mock.calls[0] as [string, string[], { env: NodeJS.ProcessEnv; stdio: unknown }];
  }
  // Both output slots piped, not ignored: what the browser says on its way out is the only account
  // of why it went, and an unread pipe would block the child once its buffer filled.
  it('pipes the child\'s output rather than discarding it', async () => {
    await start();
    expect(spawnCall()[2].stdio).toEqual(['ignore', 'pipe', 'pipe']);
  });

  it('runs the server\'s own interpreter', async () => {
    await start();
    expect(spawnCall()[0]).toBe(process.execPath);
  });

  it('gives it a child entry that exists in the tree this process is running', async () => {
    await start();
    const [, args] = spawnCall();
    expect(existsSync(args[args.indexOf('e2e-browser') - 1])).toBe(true);
  });

  it('keeps the subcommand and its arguments after the entry', async () => {
    await start();
    const [, args] = spawnCall();
    expect(args.slice(args.indexOf('e2e-browser'), args.indexOf('e2e-browser') + 2)).toEqual(['e2e-browser', '--port']);
  });

  it('confines the launch it actually spawns', async () => {
    await start();
    const [command, args] = spawnCall();
    const [, sandboxedCommand, sandboxedArgs] = mocks.sandboxSpawn.mock.calls[0] as [unknown, string, string[]];
    expect(sandboxedCommand).toBe(command);
    expect(sandboxedArgs).toEqual(args);
  });
});
