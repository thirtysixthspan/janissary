import type { Managers } from '../managers.js';
import { isShellPayload } from '../plugins/shell/shared.js';
import type { Tab } from '../tab/types.js';

export const SHELL_PLUGIN_ID = 'shell';
export const SHELL_COMMAND = 'shell --no-workspace';

export function shellTabPtyId(tab: Tab | undefined, managers: Managers): string | undefined {
  if (tab?.plugin?.id !== SHELL_PLUGIN_ID) return;
  const payload = tab.plugin.payload;
  if (!managers.plugins.isPayload(SHELL_PLUGIN_ID, payload) || !isShellPayload(payload)) return;
  if (typeof payload.ptyId !== 'string') return;
  return payload.ptyId;
}
