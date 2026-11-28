import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { guard, type NodeHandler } from './guard.js';

type FakeResponse = { status: number; body: string };

function request(headers: Record<string, string>, method = 'POST'): IncomingMessage {
  return { method, headers: { host: '127.0.0.1:1234', ...headers } } as never;
}

function response(): { fake: FakeResponse; res: ServerResponse } {
  const fake: FakeResponse = { status: 0, body: '' };
  const res = {
    writeHead(status: number) { fake.status = status; },
    end(body?: string) { fake.body = body ?? ''; },
  };
  return { fake, res: res as never };
}

const authorized = { authorization: 'Bearer secret', 'content-type': 'application/json' };

describe('guard', () => {
  it('answers 403 for a present origin the loopback check rejects', async () => {
    const handler = vi.fn(async () => {});
    const { fake, res } = response();

    await guard(handler as NodeHandler, 'secret')(
      request({ ...authorized, origin: 'https://evil.com' }),
      res,
    );

    expect(fake.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([undefined, 'Bearer wrong'])('answers 401 for a missing or wrong bearer token (%s)', async (authorization) => {
    const handler = vi.fn(async () => {});
    const { fake, res } = response();
    const headers = authorization ? { authorization, 'content-type': 'application/json' } : { 'content-type': 'application/json' };

    await guard(handler as NodeHandler, 'secret')(request(headers), res);

    expect(fake.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('answers 415 for a non-JSON POST', async () => {
    const handler = vi.fn(async () => {});
    const { fake, res } = response();

    await guard(handler as NodeHandler, 'secret')(
      request({ authorization: 'Bearer secret', 'content-type': 'text/plain' }),
      res,
    );

    expect(fake.status).toBe(415);
    expect(handler).not.toHaveBeenCalled();
  });

  it('lets a valid request reach the handler', async () => {
    const handler = vi.fn(async () => {});
    const { fake, res } = response();

    await guard(handler as NodeHandler, 'secret')(request(authorized), res);

    expect(handler).toHaveBeenCalledOnce();
    expect(fake.status).toBe(0);
  });
});
