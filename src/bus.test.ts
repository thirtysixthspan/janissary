import { describe, it, expect, vi } from 'vitest';
import { MessageBus } from './bus.js';

// A minimal two-event channel for testing the generic bus without transcript coupling.
type TestEvent = { type: 'ping'; value: number } | { type: 'pong'; label: string };
type TestChannels = { test: TestEvent };

const bus = () => new MessageBus<TestChannels>();
const ping = (value = 1): TestEvent => ({ type: 'ping', value });
const pong = (label = 'a'): TestEvent => ({ type: 'pong', label });

describe('EventBus', () => {
  it('on + emit: listener receives the exact event', () => {
    const b = bus();
    const fn = vi.fn();
    b.on('test', 'ping', fn);
    const event = ping();
    b.emit('test', event);
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith(event);
  });

  it('type filtering: ping listener is not called on pong emit', () => {
    const b = bus();
    const fn = vi.fn();
    b.on('test', 'ping', fn);
    b.emit('test', pong());
    expect(fn).not.toHaveBeenCalled();
  });

  it('multi-type on: receives both types; unsubscribe detaches from both', () => {
    const b = bus();
    const fn = vi.fn();
    const sub = b.on('test', ['ping', 'pong'], fn);
    b.emit('test', ping());
    b.emit('test', pong());
    expect(fn).toHaveBeenCalledTimes(2);
    sub.unsubscribe();
    b.emit('test', ping());
    b.emit('test', pong());
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('unsubscribe: detached listener is not called afterward', () => {
    const b = bus();
    const fn = vi.fn();
    const sub = b.on('test', 'ping', fn);
    sub.unsubscribe();
    b.emit('test', ping());
    expect(fn).not.toHaveBeenCalled();
  });

  it('once: fires exactly once, then auto-detaches', () => {
    const b = bus();
    const fn = vi.fn();
    b.once('test', 'ping', fn);
    b.emit('test', ping());
    b.emit('test', ping());
    expect(fn).toHaveBeenCalledOnce();
  });

  it('multiple listeners for one type all fire', () => {
    const b = bus();
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    b.on('test', 'ping', fn1);
    b.on('test', 'ping', fn2);
    b.emit('test', ping());
    expect(fn1).toHaveBeenCalledOnce();
    expect(fn2).toHaveBeenCalledOnce();
  });

  it('isolation: a throwing listener does not prevent later listeners from firing', () => {
    const b = bus();
    const thrower = vi.fn(() => { throw new Error('boom'); });
    const spy = vi.fn();
    b.on('test', 'ping', thrower);
    b.on('test', 'ping', spy);
    expect(() => b.emit('test', ping())).not.toThrow();
    expect(thrower).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledOnce();
  });

  it('copy-on-iterate: a listener removed mid-dispatch by an earlier listener still fires', () => {
    const b = bus();
    const victim = vi.fn();
    const subVictim = { unsubscribe: () => {} };
    const remover = vi.fn(() => { subVictim.unsubscribe(); });
    b.on('test', 'ping', remover);
    const realSub = b.on('test', 'ping', victim);
    subVictim.unsubscribe = realSub.unsubscribe;
    b.emit('test', ping());
    expect(victim).toHaveBeenCalledOnce();
  });

  it('emit with no registered listeners does not throw', () => {
    const b = bus();
    expect(() => b.emit('test', ping())).not.toThrow();
  });

  it('clear: subsequent emits call nothing', () => {
    const b = bus();
    const fn = vi.fn();
    b.on('test', 'ping', fn);
    b.on('test', 'pong', fn);
    b.clear();
    b.emit('test', ping());
    b.emit('test', pong());
    expect(fn).not.toHaveBeenCalled();
  });

  it('channel isolation: listeners on different channels do not cross-fire', () => {
    type MultiChannels = { a: { type: 'x' }; b: { type: 'x' } };
    const b = new MessageBus<MultiChannels>();
    const fnA = vi.fn();
    const fnB = vi.fn();
    b.on('a', 'x', fnA);
    b.on('b', 'x', fnB);
    b.emit('a', { type: 'x' });
    expect(fnA).toHaveBeenCalledOnce();
    expect(fnB).not.toHaveBeenCalled();
  });

  it('synchronous delivery: spy is called before emit returns', () => {
    const b = bus();
    const fn = vi.fn();
    b.on('test', 'ping', fn);
    b.emit('test', ping());
    expect(fn).toHaveBeenCalledOnce();
  });
});
