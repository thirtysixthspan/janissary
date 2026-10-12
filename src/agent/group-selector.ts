import { findExistingTabGroup, type TabGroup } from '../tab/groups.js';
import type { Tab } from '../tab/types.js';

export function resolveAgentGroup(tabs: readonly Tab[], selector: string | undefined): TabGroup | undefined {
  if (selector === undefined) return undefined;
  const group = findExistingTabGroup(tabs, selector);
  if (!group) throw new Error(`Agent: group "${selector}" does not exist.`);
  return group;
}
