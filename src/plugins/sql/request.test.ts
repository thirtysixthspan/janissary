import { describe, expect, it, vi } from 'vitest';
import { apply, planRequest } from './request.js';
import { SqlTabs } from './tabs.js';
import type { SqlPayload } from './shared.js';
import type { TabPluginServerCapabilities } from '../api.js';

function payload(over: Partial<SqlPayload> = {}): SqlPayload {
  return {
    database: 'shop',
    databases: [{ name: 'shop', exists: true, open: true }],
    objects: [{ name: 'orders', kind: 'table', columns: [], writable: true }],
    object: 'orders',
    filters: [],
    hidden: [],
    global: '',
    order: [],
    limit: 50,
    offset: 0,
    pageSizes: [50],
    grid: null,
    exports: [],
    error: null,
    pending: null,
    ...over,
  };
}

function capabilities() {
  return {
    updateTab: vi.fn(),
    topicAction: vi.fn(),
  } as unknown as TabPluginServerCapabilities;
}

// Not every change waits on an answer: widening the object list, hiding a column, and changing the
// page size are all local. Those arms must record the payload and redraw without putting a request
// in front of the host that nothing will ever answer.
describe('apply without a pending request', () => {
  it('records the payload in the mirror and redraws, sending nothing', () => {
    const caps = capabilities();
    const tabs = new SqlTabs();

    apply({ payload: payload({ hidden: ['total'] }) }, caps, tabs);

    expect(tabs.read('sqlite:shop')?.hidden).toEqual(['total']);
    expect(caps.topicAction).not.toHaveBeenCalled();
  });

  it('hands the tab updater the payload it just recorded, not the one it already held', () => {
    const caps = capabilities();
    const tabs = new SqlTabs();
    apply({ payload: payload() }, caps, tabs);

    apply({ payload: payload({ limit: 100, pageSizes: [50, 100] }) }, caps, tabs);

    const updater = vi.mocked(caps.updateTab).mock.calls[1]?.[1];
    expect(updater?.(tabs.read('sqlite:shop') as never)).toEqual({ payload: expect.objectContaining({ limit: 100 }) });
  });

  it('overwrites the mirror rather than merging into what was there', () => {
    const caps = capabilities();
    const tabs = new SqlTabs();
    apply({ payload: payload({ hidden: ['total'] }) }, caps, tabs);

    apply({ payload: payload() }, caps, tabs);

    expect(tabs.read('sqlite:shop')?.hidden).toEqual([]);
  });

  // A pending request is the other arm of the same function, and the ordering it guarantees is the
  // reason the two cannot be merged: the mirror has to hold the request before it goes out.
  it('records the pending request in the mirror before sending it', () => {
    const caps = capabilities();
    const tabs = new SqlTabs();
    const request = planRequest('query', payload());

    apply({ payload: payload(), request }, caps, tabs);

    expect(tabs.read('sqlite:shop')?.pending).toEqual(request.pending);
    expect(caps.topicAction).toHaveBeenCalledWith(request.action);
  });
});