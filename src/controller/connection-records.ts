import type { Managers } from '../managers.js';
import type { OpenConnectionRecordParams } from '../protocol/core-rpc.js';

function dispatchRecord(managers: Managers, tab: string, recordId: string): void {
  if (!managers.acpRecords.window(recordId)) return;
  managers.command.dispatchTo(tab, `connection ${recordId}`);
}

// A popup row opens the connections plugin's record tab through the command it already exposes.
// The tab is only the place the command runs, not a target the caller chooses: a tab-scoped ACP
// reference resolves to that tab's current live record, and a stale binding is a no-op.
export function openConnectionRecord(managers: Managers, params: OpenConnectionRecordParams): void {
  if ('recordId' in params) {
    dispatchRecord(managers, params.tab, params.recordId);
    return;
  }
  if (params.acpRef.label !== params.tab) return;
  const tab = managers.tab.byLabel(params.tab);
  const recordId = tab?.runtime?.acpRecordId;
  if (!tab || recordId === undefined) return;
  dispatchRecord(managers, tab.label, recordId);
}
