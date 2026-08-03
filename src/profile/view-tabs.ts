import path from 'node:path';
import { expandUserPath } from '../paths.js';
import { normalizeWebUrl } from '../openers/web-target.js';
import { relocateToGroup } from './editors.js';
import type { Managers } from '../managers.js';
import type { ProfileViewEntry } from './types.js';
import type { Tab } from '../tab/types.js';
import type { MainAreaCandidate } from './focus.js';

// Opens the two tab kinds that carry no authored label — a bundled-plugin tab and ssh —
// by issuing the same command a user would type, then placing the resulting tab into its
// authored group and position. Modeled on `openProfileEditors`, except that a plugin opener resolves
// through activation: every open is awaited, so the tab is available to place once `run` settles.

type ViewTarget = {
  // The identity a relaunch matches an already-open tab by, standing in for the label these tab
  // kinds don't author.
  matches: (tab: Tab) => boolean;
  // Whether an identity match is closed before opening. False only for a plugin tab, which the host
  // reuses in place for the same instance key.
  preClose: boolean;
  // Issue the equivalent user command. `open` reports its own failures into the issuing tab's
  // transcript and so returns nothing; `ssh` returns a parse error to report here.
  run: () => Promise<string | void> | string | void;
  // The identity as authored, for the note reporting a failed open.
  subject: string;
  // What the entry opens, for the launch notes — a plugin entry names its plugin (`image`) rather
  // than the generic word, so the note reads the way it did before plugins owned these tabs.
  kind: string;
};

// Resolve an entry's path the way `open` does: `$root`/`~` expand against the launch directory,
// and a still-relative path resolves from the issuing tab's working directory.
function resolvePath(managers: Managers, issuingLabel: string, target: string): string {
  const expanded = expandUserPath(target, { root: managers.tab.launchDir });
  if (path.isAbsolute(expanded)) return expanded;
  return path.resolve(managers.tab.cwdOf(issuingLabel) ?? process.cwd(), expanded);
}

// The url an `open <target>` would land on, so a page entry matches the tab it opens. An
// unnormalizable url is left as authored; `open` reports the problem itself.
function pageUrl(authored: string): string {
  const normalized = normalizeWebUrl(authored);
  return 'error' in normalized ? authored : normalized.url;
}

function buildTarget(entry: ProfileViewEntry, managers: Managers, issuingLabel: string): ViewTarget {
  switch (entry.type) {
  case 'ssh': {
    const command = [`ssh ${entry.destination}`, ...(entry.options ?? [])].join(' ');
    return {
      matches: (tab) => tab.harness?.name === 'ssh' && tab.harness.destination === entry.destination,
      preClose: true, subject: entry.destination, kind: 'ssh', run: () => managers.ssh.run(command),
    };
  }
  default: {
    if (entry.path === undefined) return commandTarget(entry.id, managers, issuingLabel);
    return claimsWebTargets(managers, entry.id)
      ? webTarget(entry.id, entry.path, managers, issuingLabel)
      : fileTarget(entry.id, entry.path, managers, issuingLabel);
  }
  }
}

function claimsWebTargets(managers: Managers, id: string): boolean {
  return managers.plugins.declarations.find((entry) => entry.id === id)?.webTargets === true;
}

function fileTarget(
  id: string, authored: string, managers: Managers, issuingLabel: string,
): ViewTarget {
  const file = resolvePath(managers, issuingLabel, authored);
  return {
    matches: (tab) => tab.plugin?.id === id && tab.plugin.instanceKey === file,
    preClose: false, subject: authored, kind: id,
    run: () => managers.openFile.run(`open ${authored}`, issuingLabel),
  };
}

// A plugin that opens on web addresses is reached by `open`, like a file plugin, but its entry names
// an address rather than a path. The `page` keyword is what forces web interpretation, so a
// hand-authored bare address (`slashdot.org`) reopens the same way `profile save`'s normalized one
// does, and both match the tab by the address the plugin keys it with.
function webTarget(
  id: string, authored: string, managers: Managers, issuingLabel: string,
): ViewTarget {
  const url = pageUrl(authored);
  return {
    matches: (tab) => tab.plugin?.id === id && tab.plugin.instanceKey === url,
    preClose: false, subject: authored, kind: id,
    run: () => { managers.openFile.run(`open page ${authored}`, issuingLabel); },
  };
}

// A plugin that opens on no file is reached by its declared command, so a relaunch reissues that
// command and matches on the plugin id alone — such a plugin's tab is its only one.
function commandTarget(id: string, managers: Managers, issuingLabel: string): ViewTarget {
  const command = managers.plugins.declarations.find((entry) => entry.id === id)?.command;
  return {
    matches: (tab) => tab.plugin?.id === id,
    preClose: false, subject: id, kind: id,
    run: async () => {
      if (!command) return `Could not open ${id} tab: the plugin declares no command.`;
      // Straight through the plugin host rather than the command dispatcher: a relaunch should not
      // add the command to the issuing tab's history the way typing it would.
      await managers.plugins.runCommand(id, command, { label: issuingLabel, command });
    },
  };
}

// Relaunch semantics for a label-less tab: close the open tab holding the same identity first, so
// the reopened one takes its authored position instead of landing beside it under a unique label.
function closeMatching(managers: Managers, target: ViewTarget, notes: string[]): void {
  const index = managers.tab.tabs.findIndex((tab) => target.matches(tab));
  if (index === -1) return;
  const label = managers.tab.tabs[index].label;
  managers.tab.closeTab(index);
  notes.push(`Relaunched "${label}".`);
}

export async function openProfileViewTabs(
  views: ProfileViewEntry[], managers: Managers, issuingLabel: string,
  defaultGroup: number, colorForGroup: (group: number, fallbackDotColor: string) => string,
  notes: string[],
): Promise<MainAreaCandidate[]> {
  const opened: MainAreaCandidate[] = [];
  for (const entry of views) {
    const target = buildTarget(entry, managers, issuingLabel);
    if (target.preClose) closeMatching(managers, target, notes);
    const error = await target.run();
    const tab = managers.tab.tabs.find((t) => target.matches(t));
    if (!tab) {
      notes.push(typeof error === 'string' ? error : `Could not open ${target.kind} tab "${target.subject}".`);
      continue;
    }
    // A docked entry leaves the strip entirely, so it takes no group, position, or focus — the same
    // shape a docked file navigator has.
    const dock = entry.type === 'plugin' ? entry.dock : undefined;
    if (dock) {
      managers.tab.setDock(managers.tab.findIndex(tab.label), dock);
      notes.push(`Opened ${target.kind} tab.`);
      continue;
    }
    const group = entry.group ?? defaultGroup;
    relocateToGroup(managers, group, colorForGroup(group, tab.dotColor));
    opened.push({ label: tab.label, number: entry.number, focus: entry.focus, pane: entry.pane });
    notes.push(`Opened ${target.kind} tab.`);
  }
  return opened;
}
