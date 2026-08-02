import path from 'node:path';
import { expandUserPath } from '../paths.js';
import { normalizeWebUrl } from '../openers/page.js';
import { relocateToGroup } from './editors.js';
import type { Managers } from '../managers.js';
import type { ProfileViewEntry } from './types.js';
import type { Tab } from '../tab/types.js';
import type { MainAreaCandidate } from './focus.js';

// Opens the four tab kinds that carry no authored label — image, markdown, page, and ssh — by
// issuing the same command a user would type, then placing the resulting tab into its authored
// group and position. Modeled on `openProfileEditors`: the openers behind `open` and `ssh` are all
// synchronous and leave the new tab active, so the tab is available to place as soon as the call
// returns.

type ViewTarget = {
  // The identity a relaunch matches an already-open tab by, standing in for the label these tab
  // kinds don't author.
  matches: (tab: Tab) => boolean;
  // Whether an identity match is closed before opening. False only for an image tab, which
  // `openImageTab` reuses in place for the same path.
  preClose: boolean;
  // Issue the equivalent user command. `open` reports its own failures into the issuing tab's
  // transcript and so returns nothing; `ssh` returns a parse error to report here.
  run: () => string | void;
  // The identity as authored, for the note reporting a failed open.
  subject: string;
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
  case 'page': {
    const url = pageUrl(entry.url);
    return {
      matches: (tab) => tab.page?.url === url, preClose: true, subject: entry.url,
      run: () => { managers.openFile.run(`open ${entry.url}`, issuingLabel); },
    };
  }
  case 'ssh': {
    const command = [`ssh ${entry.destination}`, ...(entry.options ?? [])].join(' ');
    return {
      matches: (tab) => tab.harness?.name === 'ssh' && tab.harness.destination === entry.destination,
      preClose: true, subject: entry.destination, run: () => managers.ssh.run(command),
    };
  }
  case 'image': {
    const file = resolvePath(managers, issuingLabel, entry.path);
    return {
      matches: (tab) => tab.image?.path === file, preClose: false, subject: entry.path,
      run: () => { managers.openFile.run(`open ${entry.path}`, issuingLabel); },
    };
  }
  default: {
    const file = resolvePath(managers, issuingLabel, entry.path);
    return {
      matches: (tab) => tab.markdown?.path === file, preClose: true, subject: entry.path,
      run: () => { managers.openFile.run(`open ${entry.path}`, issuingLabel); },
    };
  }
  }
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

export function openProfileViewTabs(
  views: ProfileViewEntry[], managers: Managers, issuingLabel: string,
  defaultGroup: number, colorForGroup: (group: number, fallbackDotColor: string) => string,
  notes: string[],
): MainAreaCandidate[] {
  const opened: MainAreaCandidate[] = [];
  for (const entry of views) {
    const target = buildTarget(entry, managers, issuingLabel);
    if (target.preClose) closeMatching(managers, target, notes);
    const error = target.run();
    const tab = managers.tab.tabs.find((t) => target.matches(t));
    if (!tab) {
      notes.push(typeof error === 'string' ? error : `Could not open ${entry.type} tab "${target.subject}".`);
      continue;
    }
    const group = entry.group ?? defaultGroup;
    relocateToGroup(managers, group, colorForGroup(group, tab.dotColor));
    opened.push({ label: tab.label, number: entry.number, focus: entry.focus, pane: entry.pane });
    notes.push(`Opened ${entry.type} tab.`);
  }
  return opened;
}
