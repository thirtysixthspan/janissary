import { describe, expect, it, vi } from 'vitest';
import { openConnectionRecord } from './connection-records.js';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';

function setup(options: {
  records?: Record<string, unknown>;
  tabs?: Record<string, Partial<Tab>>;
} = {}) {
  const dispatchTo = vi.fn();
  const window = vi.fn((id: string) => options.records?.[id]);
  const byLabel = vi.fn((label: string) => options.tabs?.[label]);
  const managers = {
    acpRecords: { window },
    command: { dispatchTo },
    tab: { byLabel },
  } as unknown as Managers;
  return { managers, dispatchTo, window, byLabel };
}

describe('openConnectionRecord', () => {
  it('dispatches the connections command for a durable record id', () => {
    const { managers, dispatchTo } = setup({ records: { 'record-1': { status: 'Closed' } } });

    openConnectionRecord(managers, { tab: 'main', recordId: 'record-1' });

    expect(dispatchTo).toHaveBeenCalledWith('main', 'connection record-1');
  });

  it('no-ops for a missing or expired record id', () => {
    const { managers, dispatchTo } = setup();

    openConnectionRecord(managers, { tab: 'main', recordId: 'missing' });

    expect(dispatchTo).not.toHaveBeenCalled();
  });

  it('resolves a tab-scoped ACP reference through that tab\'s live record', () => {
    const { managers, dispatchTo } = setup({
      records: { 'record-1': {} },
      tabs: { main: { label: 'main', runtime: { acpRecordId: 'record-1' } } },
    });

    openConnectionRecord(managers, { tab: 'main', acpRef: { scope: 'tab', label: 'main' } });

    expect(dispatchTo).toHaveBeenCalledWith('main', 'connection record-1');
  });

  it('no-ops when a tab-scoped ACP reference names another tab', () => {
    const { managers, dispatchTo } = setup({
      records: { 'record-1': {} },
      tabs: { main: { label: 'main', runtime: { acpRecordId: 'record-1' } } },
    });

    openConnectionRecord(managers, { tab: 'main', acpRef: { scope: 'tab', label: 'other' } });

    expect(dispatchTo).not.toHaveBeenCalled();
  });

  it('no-ops when the tab or its live record binding has disappeared', () => {
    const missingTab = setup();
    openConnectionRecord(missingTab.managers, { tab: 'main', acpRef: { scope: 'tab', label: 'main' } });
    expect(missingTab.dispatchTo).not.toHaveBeenCalled();

    const missingRecord = setup({ tabs: { main: { label: 'main' } } });
    openConnectionRecord(missingRecord.managers, { tab: 'main', acpRef: { scope: 'tab', label: 'main' } });
    expect(missingRecord.dispatchTo).not.toHaveBeenCalled();
  });

  it('no-ops when the tab binding points at a record that has since expired', () => {
    const { managers, dispatchTo } = setup({
      tabs: { main: { label: 'main', runtime: { acpRecordId: 'expired' } } },
    });

    openConnectionRecord(managers, { tab: 'main', acpRef: { scope: 'tab', label: 'main' } });

    expect(dispatchTo).not.toHaveBeenCalled();
  });
});
