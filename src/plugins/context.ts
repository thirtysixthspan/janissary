import type { Managers } from '../managers.js';
import { getConfig } from '../config.js';
import { didOsOpen } from '../openers/os-open.js';
import {
  TabPluginRejection,
  type TabPluginActivation,
  type TabPluginDeclaration,
  type TabPluginServerCapabilities,
} from './api.js';
import type { PluginFailureOrigin } from './failure.js';

export function isJsonCompatible(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  const valid = Array.isArray(value)
    ? value.every((item) => isJsonCompatible(item, seen))
    : Object.values(value).every((item) => isJsonCompatible(item, seen));
  seen.delete(value);
  return valid;
}

export function createPluginContext(
  managers: Managers,
  declaration: TabPluginDeclaration,
  activation: TabPluginActivation,
  origin: PluginFailureOrigin,
  isEnabled: () => boolean,
  // Collects `openClaimedFiles` targets for the host to run once the guarded call has returned.
  openRequests: string[] = [],
): TabPluginServerCapabilities {
  return {
    note: (text) => {
      if (!isEnabled()) return;
      if (managers.tab.tabs.some((tab) => tab.label === origin.label)) {
        managers.tab.append(origin.label, { input: origin.command, output: text });
      }
    },
    openOrFocusTab: (instanceKey, factory) => {
      if (!isEnabled()) return;
      if (managers.tab.tabs.every((tab) => tab.label !== origin.label)) return;
      managers.tab.openPluginTab(
        declaration.id,
        declaration.tabLabelPrefix,
        instanceKey,
        declaration.payloadSchemaVersion,
        origin.label,
        (resources) => {
          const created = factory(resources);
          if (!created.title.trim()) throw new Error('produced an empty tab title');
          if (!activation.isPayload(created.payload) || !isJsonCompatible(created.payload)) {
            throw new Error('produced an invalid tab payload');
          }
          return created;
        },
      );
    },
    openClaimedFiles: (target) => {
      if (!isEnabled()) return;
      openRequests.push(target);
    },
    configuredViewer: () => isEnabled() ? getConfig().externalViewers?.[declaration.id] ?? '' : '',
    openExternally: (absPath, application) => isEnabled() && didOsOpen(absPath, application),
    rejectRequest: (reason) => {
      throw new TabPluginRejection(reason);
    },
    reportFailure: (reason) => {
      throw reason instanceof Error ? reason : new Error(String(reason));
    },
  };
}
