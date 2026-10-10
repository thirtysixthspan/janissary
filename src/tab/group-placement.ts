import { distinctColor } from './colors.js';
import { resolveTabGroup } from './groups.js';
import type { Tab } from './types.js';

export function requestedTabGroup(
  tabs: readonly Tab[], selector: string | undefined, creator: Tab | undefined,
): ReturnType<typeof resolveTabGroup> | undefined {
  if (selector === undefined) return undefined;
  const fallbackColor = distinctColor(tabs.map((tab) => tab.dotColor));
  return resolveTabGroup(tabs, selector, creator, fallbackColor);
}
