import { describe, it, expect, vi } from 'vitest';
import { mapMaybe } from './maybe-promise.js';

describe('mapMaybe', () => {
  it('maps a plain value synchronously and returns it unwrapped', () => {
    const result = mapMaybe(2, (value) => value * 3);
    expect(result).toBe(6);
    expect(result).not.toBeInstanceOf(Promise);
  });

  it('maps a promised value and returns a promise of the result', async () => {
    const result = mapMaybe(Promise.resolve(2), (value) => value * 3);
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBe(6);
  });

  it('does not invoke the mapper before a promised value settles', async () => {
    const map = vi.fn((value: number) => value + 1);
    const pending = Promise.withResolvers<number>();

    const result = mapMaybe(pending.promise, map);
    expect(map).not.toHaveBeenCalled();

    pending.resolve(1);
    await expect(result).resolves.toBe(2);
    expect(map).toHaveBeenCalledWith(1);
  });

  it('rejects rather than throwing when the mapper throws on a promised value', async () => {
    const result = mapMaybe(Promise.resolve(1), () => { throw new Error('boom'); });
    await expect(result).rejects.toThrow('boom');
  });
});
