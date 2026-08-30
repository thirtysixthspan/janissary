import { describe, expect, it, vi } from 'vitest';
import type * as ClientMessageModule from './client-message.js';
import type { Controller } from './controller.js';
import type { ClientMessage, ServerEvent } from './protocol.js';

// The contract table is what admits a method to the dispatcher, so a method with a contract and no
// `case` is the exact slip this guards against: it compiles today only because the mock stands in
// for the table. Everything the real table already lists keeps its real reply mode.
const PHANTOM_METHODS = new Set(['phantomMethod', 'phantomFileNavigatorItem']);

vi.mock('./client-message.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ClientMessageModule>();
  return {
    ...actual,
    clientReplyMode: (value: unknown) => (typeof value === 'string' && PHANTOM_METHODS.has(value)
      ? 'ack'
      : actual.clientReplyMode(value)),
  };
});

const { handle } = await import('./message-handler.js');
const { dispatchFileNavigatorMessage } = await import('./message-handler-file-navigator.js');

describe('dispatcher exhaustiveness', () => {
  const controller = { setActiveTab: vi.fn() } as unknown as Controller;

  function repliesFor(method: string, params: Record<string, unknown> = {}): ServerEvent[] {
    const replies: ServerEvent[] = [];
    handle(
      controller,
      { t: 'rpc', id: 7, method, params } as unknown as ClientMessage,
      (event) => { replies.push(event); },
    );
    return replies;
  }

  it('answers a contracted method with no handler with an error naming it', () => {
    expect(repliesFor('phantomMethod')).toEqual([
      { t: 'rpc-reply', id: 7, error: 'Unhandled client RPC method: phantomMethod' },
    ]);
  });

  it('does not answer an unhandled method with a successful acknowledgement', () => {
    const [reply] = repliesFor('phantomMethod');

    expect(reply).not.toMatchObject({ result: 'ok' });
  });

  // The outer switch answers this one, since a method missing from its own case list never reaches
  // the delegate. The inner dispatcher is checked directly below.
  it('answers an unhandled file-navigator method through the outer dispatcher', () => {
    expect(repliesFor('phantomFileNavigatorItem', { index: 0 })).toEqual([
      { t: 'rpc-reply', id: 7, error: 'Unhandled client RPC method: phantomFileNavigatorItem' },
    ]);
  });

  it('throws from the file-navigator dispatcher itself rather than returning undefined', () => {
    const message = { t: 'rpc', id: 7, method: 'phantomFileNavigatorItem', params: { index: 0 } };

    expect(() => dispatchFileNavigatorMessage(controller, message as never))
      .toThrow('Unhandled client RPC method: phantomFileNavigatorItem');
  });

  it('still dispatches a handled method normally', () => {
    expect(repliesFor('setActiveTab', { index: 2 })).toEqual([{ t: 'rpc-reply', id: 7, result: 'ok' }]);
    expect(controller.setActiveTab).toHaveBeenCalledWith(2);
  });

  it('still ignores a method the contract table does not admit', () => {
    expect(repliesFor('notAMethodAtAll')).toEqual([]);
  });
});
