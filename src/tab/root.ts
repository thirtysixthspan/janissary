import type { Tab } from './types.js';
import { makeTab } from './index.js';
import { distinctColor } from './colors.js';

export function makeRootTab(): Tab {
  const tab = makeTab('janus', distinctColor([]));
  tab.toolStepsExpanded = false;
  return tab;
}
