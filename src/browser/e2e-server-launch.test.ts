import { existsSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { E2E_LOOPBACK_HOST } from './e2e-loopback.js';
import { e2eServerMocks, resetE2EServerFixture, start } from './e2e-server-test-fixture.js';

const mocks = e2eServerMocks();
beforeEach(resetE2EServerFixture);

describe('startE2EBrowserServer environment', () => {
  it('publishes the guard\'s endpoint and never the browser\'s own', () => {
    const { env } = start();
    const guardCall = mocks.startE2EGuard.mock.calls[0][0] as {
      port: number; wsPath: string; upstreamPort: number; upstreamPath: string;
    };
    const endpoint = env.JANISSARY_BROWSER_WS_ENDPOINT ?? '';
    expect(endpoint).toBe(`ws://127.0.0.1:${guardCall.port}${guardCall.wsPath}`);
    expect(endpoint).not.toContain(guardCall.upstreamPath);
    expect(endpoint).not.toContain(String(guardCall.upstreamPort));
  });

  it('mints two distinct unguessable paths', () => {
    start();
    const call = mocks.startE2EGuard.mock.calls[0][0] as { wsPath: string; upstreamPath: string };
    expect(call.wsPath).not.toBe(call.upstreamPath);
    expect(call.wsPath.length).toBeGreaterThan(24);
    expect(call.upstreamPath.length).toBeGreaterThan(24);
  });

  it('names the shared loopback address in the endpoint it hands the agent', () => {
    const endpoint = start().env.JANISSARY_BROWSER_WS_ENDPOINT ?? '';
    expect(endpoint.startsWith(`ws://${E2E_LOOPBACK_HOST}:`)).toBe(true);
  });

  it('resolves JANISSARY_PLAYWRIGHT to the package entry the server is running', () => {
    expect(start().env.JANISSARY_PLAYWRIGHT).toBe('/app/node_modules/playwright/index.js');
  });

  it('carries exactly the two variables', () => {
    const names = Object.keys(start().env).toSorted((a, b) => a.localeCompare(b));
    expect(names).toEqual(['JANISSARY_BROWSER_WS_ENDPOINT', 'JANISSARY_PLAYWRIGHT']);
  });

  it('returns synchronously, before the child can have started', () => {
    expect(start().env.JANISSARY_BROWSER_WS_ENDPOINT).toBeTruthy();
  });
});

describe('startE2EBrowserServer ports', () => {
  function guardCall(index: number) {
    return mocks.startE2EGuard.mock.calls[index][0] as { port: number; upstreamPort: number };
  }

  it('never points the guard at its own listening port', () => {
    start();
    expect(guardCall(0).port).not.toBe(guardCall(0).upstreamPort);
  });

  it('keeps the private browser port out of the harness environment', () => {
    const server = start();
    expect(Object.values(server.env)).not.toContain(String(guardCall(0).upstreamPort));
    expect(server).not.toHaveProperty('browserPort');
  });

  it('reports a full band through onGone and hands back no browser variables', () => {
    mocks.portsThrow = 'no free e2e browser port between 65280 and 65535';
    const server = start();
    expect(server.onGone).toHaveBeenCalledTimes(1);
    expect(String(server.onGone.mock.calls[0][0])).toContain('no free e2e browser port');
    expect(server.env).toEqual({});
    expect(mocks.startE2EGuard).not.toHaveBeenCalled();
    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(() => server.handle.close()).not.toThrow();
  });

  it('gives two live browsers four distinct ports', () => {
    const first = start();
    const second = start();
    const ports = [guardCall(0).port, guardCall(0).upstreamPort, guardCall(1).port, guardCall(1).upstreamPort];
    expect(new Set(ports).size).toBe(4);
    first.handle.close();
    second.handle.close();
  });

  it('frees only the closed browser\'s ports', () => {
    const first = start();
    const second = start();
    first.handle.close();
    const third = start();
    const stillLive = [guardCall(1).port, guardCall(1).upstreamPort];
    expect(stillLive).not.toContain(guardCall(2).port);
    expect(stillLive).not.toContain(guardCall(2).upstreamPort);
    second.handle.close();
    third.handle.close();
  });
});

describe('startE2EBrowserServer workspace', () => {
  it('allocates its scratch directory rather than deriving one from the label', () => {
    start();
    expect(mocks.allocateBrowserScratch).toHaveBeenCalledTimes(1);
    expect(mocks.allocateBrowserScratch).toHaveBeenCalledWith('bot');
  });

  it('confines the child with the browser profile against that workspace', () => {
    start();
    const [options] = mocks.sandboxSpawn.mock.calls[0] as [{ workspaceDir: string; browser: { chromiumDir: string } }];
    expect(options.workspaceDir).toBe('/ws/browsers/bot-token');
    expect(options.browser.chromiumDir).toBe('/pw/Chrome.app');
  });

  it('names the code tree the launch resolved, not the installation root', () => {
    start();
    const [options] = mocks.sandboxSpawn.mock.calls[0] as [{ browser: { appDir: string; appEntryDir: string; playwrightDirs: string[] } }];
    const [, args] = mocks.spawn.mock.calls[0] as [string, string[]];
    const entry = args[args.indexOf('e2e-browser') - 1];
    expect(options.browser.appEntryDir).toBe(path.dirname(entry));
    expect(options.browser.appEntryDir).not.toBe(options.browser.appDir);
    expect(options.browser.playwrightDirs).toEqual([
      '/app/node_modules/playwright', '/app/node_modules/playwright-core',
    ]);
  });

  it('points the child\'s TMPDIR at the allocated temp sibling', () => {
    start();
    const spawnOptions = (mocks.spawn.mock.calls[0] as [string, string[], { env: NodeJS.ProcessEnv }])[2];
    expect(spawnOptions.env.TMPDIR).toBe('/ws/browsers/bot-token.tmp');
  });

  it('passes the child the internal port and directory, not the published ones', () => {
    start();
    const guardCall = mocks.startE2EGuard.mock.calls[0][0] as { upstreamPort: number; upstreamPath: string };
    const [, args] = mocks.spawn.mock.calls[0] as [string, string[]];
    expect(args).toContain('e2e-browser');
    expect(args[args.indexOf('--port') + 1]).toBe(String(guardCall.upstreamPort));
    expect(args[args.indexOf('--dir') + 1]).toBe('/ws/browsers/bot-token');
  });

  it('keeps the internal path out of the child\'s argument vector', () => {
    start();
    const guardCall = mocks.startE2EGuard.mock.calls[0][0] as { upstreamPath: string };
    const [command, args] = mocks.spawn.mock.calls[0] as [string, string[]];
    expect([command, ...args].join(' ')).not.toContain(guardCall.upstreamPath);
  });

  it('hands the internal path to the child in its environment instead', () => {
    start();
    const guardCall = mocks.startE2EGuard.mock.calls[0][0] as { upstreamPath: string };
    const spawnOptions = (mocks.spawn.mock.calls[0] as [string, string[], { env: NodeJS.ProcessEnv }])[2];
    expect(spawnOptions.env.JANISSARY_E2E_WS_PATH).toBe(guardCall.upstreamPath);
  });
});

describe('startE2EBrowserServer child launch', () => {
  function spawnCall() {
    return mocks.spawn.mock.calls[0] as [string, string[], { env: NodeJS.ProcessEnv }];
  }

  it('runs the server\'s own interpreter', () => {
    start();
    expect(spawnCall()[0]).toBe(process.execPath);
  });

  it('gives it a child entry that exists in the tree this process is running', () => {
    start();
    const [, args] = spawnCall();
    expect(existsSync(args[args.indexOf('e2e-browser') - 1])).toBe(true);
  });

  it('keeps the subcommand and its arguments after the entry', () => {
    start();
    const [, args] = spawnCall();
    expect(args.slice(args.indexOf('e2e-browser'), args.indexOf('e2e-browser') + 2)).toEqual(['e2e-browser', '--port']);
  });

  it('confines the launch it actually spawns', () => {
    start();
    const [command, args] = spawnCall();
    const [, sandboxedCommand, sandboxedArgs] = mocks.sandboxSpawn.mock.calls[0] as [unknown, string, string[]];
    expect(sandboxedCommand).toBe(command);
    expect(sandboxedArgs).toEqual(args);
  });
});
