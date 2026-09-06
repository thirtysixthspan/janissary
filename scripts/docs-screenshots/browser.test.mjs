import { describe, expect, it, vi } from 'vitest';
import { attachedBrowserFromEnv, connectAttached } from './browser.mjs';

const ENDPOINT = 'ws://127.0.0.1:41234/secret';
const CLIENT_PATH = '/app/node_modules/playwright/index.js';

describe('attachedBrowserFromEnv', () => {
  it('reads the endpoint and client path janissary published', () => {
    const attached = attachedBrowserFromEnv({
      JANISSARY_BROWSER_WS_ENDPOINT: ENDPOINT,
      JANISSARY_PLAYWRIGHT: CLIENT_PATH,
    });
    expect(attached).toEqual({ endpoint: ENDPOINT, clientPath: CLIENT_PATH });
  });

  it('has no attached browser when the endpoint is missing', () => {
    expect(attachedBrowserFromEnv({ JANISSARY_PLAYWRIGHT: CLIENT_PATH })).toBeUndefined();
  });

  it('has no attached browser when the client path is missing', () => {
    expect(attachedBrowserFromEnv({ JANISSARY_BROWSER_WS_ENDPOINT: ENDPOINT })).toBeUndefined();
  });

  it('has no attached browser on a host, where neither variable is set', () => {
    expect(attachedBrowserFromEnv({})).toBeUndefined();
  });

  it('treats an empty value as unset rather than as an endpoint to dial', () => {
    const empty = attachedBrowserFromEnv({
      JANISSARY_BROWSER_WS_ENDPOINT: '',
      JANISSARY_PLAYWRIGHT: CLIENT_PATH,
    });
    expect(empty).toBeUndefined();
    expect(attachedBrowserFromEnv({
      JANISSARY_BROWSER_WS_ENDPOINT: ENDPOINT,
      JANISSARY_PLAYWRIGHT: '',
    })).toBeUndefined();
  });
});

describe('connectAttached', () => {
  const noSleep = () => vi.fn().mockResolvedValue();

  it('returns the browser and never sleeps when the first connect succeeds', async () => {
    const sleep = noSleep();
    const client = { connect: vi.fn().mockResolvedValue('browser') };
    expect(await connectAttached(client, ENDPOINT, { retryDelayMs: 5, sleep })).toBe('browser');
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.connect).toHaveBeenCalledWith(ENDPOINT);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries once when the browser has not finished starting', async () => {
    const sleep = noSleep();
    const client = {
      connect: vi.fn()
        .mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
        .mockResolvedValueOnce('browser'),
    };
    expect(await connectAttached(client, ENDPOINT, { retryDelayMs: 5, sleep })).toBe('browser');
    expect(client.connect).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(5);
  });

  it('reports the second failure and does not attempt a third connect', async () => {
    const client = {
      connect: vi.fn()
        .mockRejectedValueOnce(new Error('first'))
        .mockRejectedValueOnce(new Error('the browser is gone')),
    };
    await expect(connectAttached(client, ENDPOINT, { retryDelayMs: 5, sleep: noSleep() }))
      .rejects.toThrow('the browser is gone');
    expect(client.connect).toHaveBeenCalledTimes(2);
  });
});
