import { describe, it, expect, vi } from 'vitest';
import { guardRequest, type RequestHandler } from './request-boundary.js';
import { fakeRequest, fakeResponse, type FakeResponse } from './http-test-fixture.js';

// The boundary is what stands between a rejected handler and an unhandled rejection that would take
// the process and every agent tab with it. It is driven here with a recorded request/response rather
// than a socket: the thing under test is which answer comes back, and a loopback connection would
// only add a way for the answer to go missing without saying anything about the boundary.

// Run one handler through the boundary. The guard attaches its own catch and returns, so a case waits
// for the response to reach a state rather than for a tick — a handler that fails late has its own
// clock, and pretending otherwise only reintroduces the timing this is meant to drop.
function run(handler: RequestHandler): FakeResponse {
  const fake = fakeResponse();
  guardRequest(handler)(fakeRequest(), fake.res);
  return fake;
}

const answered = ({ recorded }: FakeResponse) => ({
  status: recorded.status,
  body: recorded.body,
  destroyed: recorded.destroyed,
  ended: recorded.ended,
});

describe('guardRequest', () => {
  // URL parsing and percent-decoding are the two steps a malformed request can break, and each fails
  // with its own error type — so each has to be told apart from the server's own faults.
  it('answers 400 for a URL parsing failure', async () => {
    const fake = run(async () => { new URL('//', 'http://localhost'); });
    await vi.waitFor(() => { expect(fake.recorded.ended).toBe(true); });
    expect(answered(fake)).toEqual({ status: 400, body: 'bad request', destroyed: false, ended: true });
  });

  it('answers 400 for a percent-decoding failure', async () => {
    const fake = run(async () => { decodeURIComponent('%E0%A4%A'); });
    await vi.waitFor(() => { expect(fake.recorded.ended).toBe(true); });
    expect(answered(fake)).toEqual({ status: 400, body: 'bad request', destroyed: false, ended: true });
  });

  it('answers 500 for any other failure', async () => {
    const fake = run(async () => { throw new Error('boom'); });
    await vi.waitFor(() => { expect(fake.recorded.ended).toBe(true); });
    expect(answered(fake)).toEqual({ status: 500, body: 'internal error', destroyed: false, ended: true });
  });

  // A second status line after the headers are out is a protocol error, not a response: the answer
  // the handler already started is the only one the client can be given. So the socket is torn down
  // rather than a second header written over the first.
  it('destroys the response instead of writing a second status once headers are sent', async () => {
    const fake = run(async (_request, res) => {
      res.writeHead(200);
      res.write('partial');
      await new Promise((resolve) => setTimeout(resolve, 20));
      throw new Error('late failure');
    });
    await vi.waitFor(() => { expect(fake.recorded.destroyed).toBe(true); });
    // The 200 stands: it is the only status the client can be given, and the body is cut off rather
    // than completed. Never ended, because the handler never finished writing it.
    expect(answered(fake)).toEqual({ status: 200, body: 'partial', destroyed: true, ended: false });
  });

  it('leaves a handler that succeeds alone', async () => {
    const fake = run(async (_request, res) => { res.writeHead(200).end('ok'); });
    await vi.waitFor(() => { expect(fake.recorded.ended).toBe(true); });
    expect(answered(fake)).toEqual({ status: 200, body: 'ok', destroyed: false, ended: true });
  });

  // Nothing written at all is not a failure: a handler that has its own business to do simply has
  // not answered yet, and the boundary must not invent an answer on its behalf. A resolved handler
  // cannot write later, so a few turns of the loop are enough to be sure nothing is coming.
  it('writes nothing for a handler that resolves without answering', async () => {
    const fake = run(async () => {});
    for (let turn = 0; turn < 5; turn++) await Promise.resolve();
    expect(answered(fake)).toEqual({ status: 200, body: '', destroyed: false, ended: false });
  });
});
