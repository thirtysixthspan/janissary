import { describe, expect, it, vi } from 'vitest';
import { settleReply, type Reply } from './reply.js';

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

const ok = (id: number, result: unknown) => ({ t: 'rpc-reply', id, result });
const failed = (id: number, error: string) => ({ t: 'rpc-reply', id, error });

describe('settleReply in deferred mode', () => {
  // A deferred method hands back the callback it will resolve through later, so the reply is only
  // sent when that callback fires — not when dispatch returns.
  it('resolves through the callback the dispatch returned', () => {
    const reply = vi.fn();
    let settle: ((value: unknown) => void) | undefined;
    settleReply(reply, 1, 'deferred', (resolve: (value: unknown) => void) => { settle = resolve; });
    expect(reply).not.toHaveBeenCalled();

    settle?.('done');
    expect(reply).toHaveBeenCalledExactlyOnceWith(ok(1, 'done'));
  });

  it('awaits a promise the dispatch returned and replies with its value', async () => {
    const reply = vi.fn();
    settleReply(reply, 2, 'deferred', Promise.resolve('done'));
    await flush();
    expect(reply).toHaveBeenCalledExactlyOnceWith(ok(2, 'done'));
  });

  it('replies with the error text when the dispatch rejected', async () => {
    const reply = vi.fn();
    settleReply(reply, 3, 'deferred', Promise.reject(new Error('boom')));
    await flush();
    expect(reply).toHaveBeenCalledExactlyOnceWith(failed(3, 'boom'));
  });
});

describe('settleReply in result mode', () => {
  it('replies with a plain value as it stands', () => {
    const reply = vi.fn();
    settleReply(reply, 4, 'result', { a: 1 });
    expect(reply).toHaveBeenCalledExactlyOnceWith(ok(4, { a: 1 }));
  });

  // An `ack` answers that the work was accepted, not what it produced: the client is waiting on the
  // transcript for the answer, and the result would be a second, contradicting one.
  it('replies "ok" rather than the work\'s own result for an ack', () => {
    const reply = vi.fn();
    settleReply(reply, 5, 'ack', { a: 1 });
    expect(reply).toHaveBeenCalledExactlyOnceWith(ok(5, 'ok'));
  });
});

describe('settleReply awaiting a dispatched promise', () => {
  it('replies with the value the promise settled to', async () => {
    const reply = vi.fn();
    settleReply(reply, 6, 'result', Promise.resolve('done'));
    expect(reply).not.toHaveBeenCalled();

    await flush();
    expect(reply).toHaveBeenCalledExactlyOnceWith(ok(6, 'done'));
  });

  it('replies "ok" for an ack, whatever the promise settled to', async () => {
    const reply = vi.fn();
    settleReply(reply, 7, 'ack', Promise.resolve({ a: 1 }));
    await flush();
    expect(reply).toHaveBeenCalledExactlyOnceWith(ok(7, 'ok'));
  });

  // A rejection has to answer, or the client waits on a reply that is never coming. The error goes
  // out as text because it crosses to a browser that cannot render the original.
  it('replies with the error text when the promise rejected', async () => {
    const reply = vi.fn();
    settleReply(reply, 8, 'result', Promise.reject(new Error('boom')));
    await flush();
    expect(reply).toHaveBeenCalledExactlyOnceWith(failed(8, 'boom'));
  });

  it('replies with the error text for a rejection that was not an Error', async () => {
    const reply = vi.fn();
    settleReply(reply, 9, 'result', Promise.reject('a bare string'));
    await flush();
    expect(reply).toHaveBeenCalledExactlyOnceWith(failed(9, 'a bare string'));
  });
});

describe('settleReply event shape', () => {
  // The two answers differ by which field carries the outcome; a reply carrying both would leave the
  // client to guess which one the server meant.
  it('carries either a result or an error, never both', async () => {
    const answers: ReturnType<Reply>[] = [];
    const collect: Reply = (event) => { answers.push(event); };

    settleReply(collect, 10, 'result', Promise.resolve('fine'));
    settleReply(collect, 11, 'result', Promise.reject(new Error('bad')));
    await flush();

    const byName = (a: string, b: string) => a.localeCompare(b);
    expect(Object.keys(answers[0]).toSorted(byName)).toEqual(['id', 'result', 't']);
    expect(Object.keys(answers[1]).toSorted(byName)).toEqual(['error', 'id', 't']);
  });
});
