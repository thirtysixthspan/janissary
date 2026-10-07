import type { TabPluginTerminalOptions } from '../plugins/api.js';
import { TabPluginRejection } from '../plugins/api-capabilities.js';
import type { Tab } from './types.js';

// Which clone a plugin terminal is confined to: the one its options name, when that is the source
// tab's own or the opened tab's own; none when they name none; and a refusal for any other directory.

export type TabClone = Pick<Tab, 'workspaceDir' | 'offline'>;

export type TerminalConfinement = {
  workspace?: { dir: string; offline: boolean };
  fromSource: boolean;
  remote?: boolean;
};

function confineTo(
  clone: TabClone | undefined, requested: NonNullable<TabPluginTerminalOptions['workspace']>,
): { dir: string; offline: boolean } | undefined {
  if (clone?.workspaceDir !== requested.dir) return undefined;
  // A plugin may ask for less network than the clone's own mode, never more.
  return { dir: clone.workspaceDir, offline: (clone.offline ?? false) || (requested.offline ?? false) };
}

export function terminalConfinement(
  requested: TabPluginTerminalOptions['workspace'],
  source: TabClone | undefined,
  own: TabClone | undefined,
  remoteWorkspace?: { dir: string; offline: boolean },
): TerminalConfinement {
  if (requested === undefined) return { fromSource: false };
  const fromOwn = confineTo(own, requested);
  if (fromOwn) return { workspace: fromOwn, fromSource: false };
  const fromSource = confineTo(source, requested);
  if (fromSource) return { workspace: fromSource, fromSource: true };
  if (remoteWorkspace?.dir === requested.dir) {
    return {
      workspace: { dir: requested.dir, offline: remoteWorkspace.offline || (requested.offline ?? false) },
      fromSource: true,
      remote: true,
    };
  }
  throw new TabPluginRejection(`Cannot confine a terminal to ${requested.dir}: it is not this tab's workspace.`);
}
