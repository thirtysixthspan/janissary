import type { ProfileLayoutFile, ProfileMonitorFile } from '../types.js';
import { getClientLayout } from '../client-layout.js';
import { getWindowBoundsReader } from '../window-resizer.js';
import type { Managers } from '../managers.js';

// Reserved-section builders for `profile save`: each returns the value `saveProfile` attaches under
// the matching plain key, so a saved profile round-trips through `profile launch`. The array
// sections are attached only when non-empty (mirroring the old "write only if non-empty"); `layout`
// is always attached.

// One record per live monitor, from the manager snapshot (which carries each monitor's `name`,
// defaulting to its persona per Decision 13). An inline monitor's targets collapse to an empty list.
export function buildMonitors(managers: Managers): ProfileMonitorFile[] {
  return managers.monitor.snapshot().map((m) => ({
    name: m.name,
    persona: m.persona,
    targets: m.inline ? [] : m.targets.map((t) => (t.kind === 'tab' ? t.label : `group:${t.group}`)),
  }));
}

// The `layout` value: sidebar/tab-area sizes from the server-retained client report (empty until a
// `reportLayout` RPC has landed), emitted with the nested `sidebar: { left, right }` shape, plus the
// window size read over CDP when a bounds reader is registered. Under `--no-open` no reader exists,
// so `window` is omitted and a skip note is added for the launch report.
export async function buildLayout(notes: string[]): Promise<ProfileLayoutFile> {
  const clientLayout = getClientLayout();
  const layout: ProfileLayoutFile = {};
  if (clientLayout) {
    if (clientLayout.sidebarLeft !== undefined || clientLayout.sidebarRight !== undefined) {
      layout.sidebar = { left: clientLayout.sidebarLeft, right: clientLayout.sidebarRight };
    }
    if (clientLayout.tabAreaPct !== undefined) layout.tabAreaPct = clientLayout.tabAreaPct;
  }
  const reader = getWindowBoundsReader();
  if (reader) layout.window = await reader();
  else notes.push('Window size not captured (no window open).');
  return layout;
}
