import type { TabView } from '@shared/protocol';
import type { JanusClient } from './ws';
import type { TabEntry } from './tab-entries';

export type BaseCenterActionAreaProps = {
  entries: TabEntry[];
  tabs: TabView[];
  activeTab: number;
  secondaryTab?: number;
  client: JanusClient;
  closeTab: (index: number) => void;
  tabNameMaxLength: number;
  activeTabNameMaxLength: number;
  onFocusCommandBar: () => void;
  onFocusEditor: (label: string) => void;
  windowFocused: boolean;
  // Labels of tabs holding unsaved work, marked in the strip beside the file name.
  dirtyTabs?: ReadonlySet<string>;
};
