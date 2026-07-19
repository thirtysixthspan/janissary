import { describe, it, expect, vi } from 'vitest';
import { wireProvisioning } from './workspace-provision-wire.js';

describe('wireProvisioning', () => {
  it('calls onReady once the promise resolves, when the tab still exists', async () => {
    const onReady = vi.fn();
    const onFailed = vi.fn();
    wireProvisioning('claude', Promise.resolve(), () => true, onReady, onFailed);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onReady).toHaveBeenCalled();
    expect(onFailed).not.toHaveBeenCalled();
  });

  it('calls onFailed with the error message when the promise rejects, when the tab still exists', async () => {
    const onReady = vi.fn();
    const onFailed = vi.fn();
    wireProvisioning('claude', Promise.reject(new Error('clone failed')), () => true, onReady, onFailed);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onFailed).toHaveBeenCalledWith('clone failed');
    expect(onReady).not.toHaveBeenCalled();
  });

  it('stringifies a non-Error rejection', async () => {
    const onFailed = vi.fn();
    wireProvisioning('claude', Promise.reject('boom'), () => true, vi.fn(), onFailed);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onFailed).toHaveBeenCalledWith('boom');
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
