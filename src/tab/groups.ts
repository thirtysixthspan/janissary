import type { Tab } from './types.js';

export type TabGroup = { id: number; name: string; color: string };

export function defaultGroupName(id: number): string {
  return id === 1 ? 'launch' : `group-${id}`;
}

export function tabGroupName(tab: Pick<Tab, 'group' | 'groupName'>): string {
  return tab.groupName ?? defaultGroupName(tab.group);
}

export function isValidGroupSelector(selector: string): boolean {
  if (!/^\d+$/u.test(selector)) return selector.length > 0;
  const id = Number(selector);
  return Number.isSafeInteger(id) && id > 0;
}

export function resolveTabGroup(
  tabs: readonly Tab[], selector: string | undefined, creator: Tab | undefined, fallbackColor: string,
): TabGroup {
  if (selector === undefined) {
    const id = creator?.group ?? 1;
    return {
      id,
      name: creator ? tabGroupName(creator) : defaultGroupName(id),
      color: creator?.groupColor ?? fallbackColor,
    };
  }

  const numericId = /^\d+$/u.test(selector) ? Number(selector) : undefined;
  if (numericId !== undefined && !isValidGroupSelector(selector)) {
    throw new Error('group id must be a positive integer');
  }
  const existing = numericId === undefined
    ? tabs.find((tab) => tabGroupName(tab).toLocaleLowerCase() === selector.toLocaleLowerCase())
    : tabs.find((tab) => tab.group === numericId);
  if (existing) {
    return { id: existing.group, name: tabGroupName(existing), color: existing.groupColor };
  }

  let maximumId = 1;
  for (const tab of tabs) {
    if (Number.isSafeInteger(tab.group) && tab.group > maximumId) maximumId = tab.group;
  }
  const id = numericId ?? maximumId + 1;
  return {
    id,
    name: numericId === undefined ? selector : defaultGroupName(id),
    color: fallbackColor,
  };
}

export function inheritGroupName(tab: Tab, tabs: readonly Tab[]): void {
  const existing = tabs.find((candidate) => candidate.group === tab.group);
  if (existing) tab.groupName = tabGroupName(existing);
}

export function inheritGroupNames(tabs: Tab[]): void {
  const names = new Map<number, string>();
  for (const tab of tabs) {
    const known = names.get(tab.group);
    if (known !== undefined) {
      tab.groupName = known;
      continue;
    }
    const name = tabGroupName(tab);
    tab.groupName = name;
    names.set(tab.group, name);
  }
}
