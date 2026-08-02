import type { Tab } from './types.js';
import { distinctColor, makeTab } from './index.js';

export function makeRootTab(): Tab {
  const tab = makeTab('janus', distinctColor([]));
  tab.toolStepsExpanded = false;
  return tab;
}
