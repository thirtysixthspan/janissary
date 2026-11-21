import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { openConnectionRecord, openRecordJson } from './connection-records.js';
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
      tabs: { main: { label: 'main', runtime: { acpRoles: { ask: { recordId: 'record-1' } } } } },
    });

    openConnectionRecord(managers, { tab: 'main', acpRef: { scope: 'tab', label: 'main', role: 'ask' } });

    expect(dispatchTo).toHaveBeenCalledWith('main', 'connection record-1');
  });

  it('resolves a tell reference through the tell role record', () => {
    const { managers, dispatchTo } = setup({
      records: { 'ask-record': {}, 'tell-record': {} },
      tabs: { main: { label: 'main', runtime: { acpRoles: {
        ask: { recordId: 'ask-record' }, tell: { recordId: 'tell-record' },
      } } } },
    });

    openConnectionRecord(managers, { tab: 'main', acpRef: { scope: 'tab', label: 'main', role: 'tell' } });

    expect(dispatchTo).toHaveBeenCalledExactlyOnceWith('main', 'connection tell-record');
  });

  it('no-ops when a tab-scoped ACP reference names another tab', () => {
    const { managers, dispatchTo } = setup({
      records: { 'record-1': {} },
      tabs: { main: { label: 'main', runtime: { acpRoles: { ask: { recordId: 'record-1' } } } } },
    });

    openConnectionRecord(managers, { tab: 'main', acpRef: { scope: 'tab', label: 'other', role: 'ask' } });

    expect(dispatchTo).not.toHaveBeenCalled();
  });

  it('no-ops when the tab or its live record binding has disappeared', () => {
    const missingTab = setup();
    openConnectionRecord(missingTab.managers, { tab: 'main', acpRef: { scope: 'tab', label: 'main', role: 'ask' } });
    expect(missingTab.dispatchTo).not.toHaveBeenCalled();

    const missingRecord = setup({ tabs: { main: { label: 'main' } } });
    openConnectionRecord(missingRecord.managers, { tab: 'main', acpRef: { scope: 'tab', label: 'main', role: 'ask' } });
    expect(missingRecord.dispatchTo).not.toHaveBeenCalled();
  });

  it('no-ops when the tab binding points at a record that has since expired', () => {
    const { managers, dispatchTo } = setup({
      tabs: { main: { label: 'main', runtime: { acpRoles: { ask: { recordId: 'expired' } } } } },
    });

    openConnectionRecord(managers, { tab: 'main', acpRef: { scope: 'tab', label: 'main', role: 'ask' } });

    expect(dispatchTo).not.toHaveBeenCalled();
  });
});

describe('openRecordJson', () => {
  const withManagers = (filePath: (id: string) => string | undefined) => {
    const edit = vi.fn();
    const managers = {
      acpRecords: { filePath },
      openFile: { edit },
      tab: { cur: () => ({ label: 'main' }) },
    } as unknown as Managers;
    return { managers, edit };
  };

  it('opens the record JSON file in an editor tab named after its id', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'connection-record-json-'));
    const id = randomUUID();
    const file = path.join(dir, `${id}.json`);
    writeFileSync(file, '{}');
    const { managers, edit } = withManagers((candidate) => candidate === id ? file : undefined);

    expect(openRecordJson(managers, id)).toBe(true);

    expect(edit).toHaveBeenCalledWith(`connection ${id}`, file, 'main');
    rmSync(dir, { recursive: true, force: true });
  });

  it('refuses an unknown id or a record file that no longer exists', () => {
    const unknown = withManagers(() => '');
    expect(openRecordJson(unknown.managers, 'missing')).toBe(false);
    expect(unknown.edit).not.toHaveBeenCalled();

    const gone = withManagers(() => path.join(tmpdir(), `missing-${randomUUID()}.json`));
    expect(openRecordJson(gone.managers, 'record-1')).toBe(false);
    expect(gone.edit).not.toHaveBeenCalled();
  });
});
