import { describe, it, expect, vi } from 'vitest';
import { wireProvisioning } from './provision-wire.js';

describe('wireProvisioning', () => {
  it('calls onReady once the promise resolves, when the tab still exists', async () => {
    const onReady = vi.fn();
    const onFailed = vi.fn();
    wireProvisioning('claude', Promise.resolve(), () => true, onReady, onFailed);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onReady).toHaveBeenCalled();
    expect(onFailed).not.toHaveBeenCalled();
  });

  it('calls onFailed with the error message and the raw error when the promise rejects, when the tab still exists', async () => {
    const onReady = vi.fn();
    const onFailed = vi.fn();
    const error = new Error('clone failed');
    wireProvisioning('claude', Promise.reject(error), () => true, onReady, onFailed);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onFailed).toHaveBeenCalledWith('clone failed', error);
    expect(onReady).not.toHaveBeenCalled();
  });

  it('stringifies a non-Error rejection, still passing the raw value', async () => {
    const onFailed = vi.fn();
    wireProvisioning('claude', Promise.reject('boom'), () => true, vi.fn(), onFailed);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onFailed).toHaveBeenCalledWith('boom', 'boom');
  });

  it('calls neither callback once the tab no longer exists (closed mid-clone)', async () => {
    const onReady = vi.fn();
    const onFailed = vi.fn();
    wireProvisioning('claude', Promise.resolve(), () => false, onReady, onFailed);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onReady).not.toHaveBeenCalled();
    expect(onFailed).not.toHaveBeenCalled();
  });

  it('calls neither callback on a rejection once the tab no longer exists (closed mid-clone)', async () => {
    const onReady = vi.fn();
    const onFailed = vi.fn();
    wireProvisioning('claude', Promise.reject(new Error('clone failed')), () => false, onReady, onFailed);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onReady).not.toHaveBeenCalled();
    expect(onFailed).not.toHaveBeenCalled();
  });
});
