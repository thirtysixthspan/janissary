import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireIntent } from './fire-intent';

describe('fireIntent', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('sends the intent name and payload and stays silent on success', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const intent = vi.fn().mockResolvedValue(undefined);
    fireIntent({ intent }, 'remember', 'ls');
    await Promise.resolve();
    expect(intent).toHaveBeenCalledWith('remember', 'ls');
    expect(warn).not.toHaveBeenCalled();
  });

  it('reports a rejection with the intent name without throwing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const intent = vi.fn().mockRejectedValue(new Error('refused'));
    expect(() => { fireIntent({ intent }, 'sync', {}); }).not.toThrow();
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('Plugin intent "sync" failed: refused');
  });
});
