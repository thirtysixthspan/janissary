import React from 'react';
import type { TabView } from '@shared/protocol';
import { isSplitEligibleTab } from '@shared/tab/placement';
import type { TabEntry } from './tab-entries';
import type { BaseCenterActionAreaProps } from './CenterActionAreaProps';
import { CenterActionArea } from './CenterActionArea';
import { ViewTabBody } from './ViewTabBody';
import { MountedViewLayers } from './MountedViewLayers';

type Properties = BaseCenterActionAreaProps & {
  current: TabView;
  mountedProps: Omit<React.ComponentProps<typeof MountedViewLayers>, 'tabs' | 'current' | 'visibleLabels' | 'client' | 'closeTab' | 'onSplit'>;
};

export function AppCenterActionArea({
  entries, tabs, activeTab, secondaryTab, client, closeTab, tabNameMaxLength,
  activeTabNameMaxLength, onFocusCommandBar, onFocusEditor, windowFocused, dirtyTabs, current,
  mountedProps,
}: Properties) {
  const splitTab = (index: number) => {
    client.send({ method: 'moveTabToOtherPane', params: { index } });
  };
  const secondary = secondaryTab === undefined ? undefined : tabs.at(secondaryTab);
  const visibleLabels = [current.label, ...(secondary ? [secondary.label] : [])];
  const renderBody = (entry: TabEntry, focused: boolean) => {
    const tab = entry.tab;
    if (['harness', 'editor', 'plugin'].includes(tab.view ?? '')) return null;
    const onSplit = () => splitTab(entry.index);
    if (tab.view) {
      return (
        <ViewTabBody
          tab={tab} client={client} index={entry.index}
          active={focused} onSplit={isSplitEligibleTab(tab) ? onSplit : undefined}
        />
      );
    }
    return null;
  };

  return (
    <CenterActionArea
      entries={entries} tabs={tabs} activeTab={activeTab} secondaryTab={secondaryTab}
      client={client} closeTab={closeTab} tabNameMaxLength={tabNameMaxLength}
      activeTabNameMaxLength={activeTabNameMaxLength}
      onFocusCommandBar={onFocusCommandBar} onFocusEditor={onFocusEditor}
      windowFocused={windowFocused} dirtyTabs={dirtyTabs} renderBody={renderBody}
      persistentLayers={<>
        <MountedViewLayers
          tabs={tabs} current={current} visibleLabels={visibleLabels} client={client}
          closeTab={closeTab} onSplit={splitTab} {...mountedProps}
        />
      </>}
    />
  );
}
