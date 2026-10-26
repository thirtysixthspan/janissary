import React from 'react';
import { isSplitEligibleTab } from '@shared/tab/placement';
import type { TabEntry } from './tab-entries';
import type { BaseCenterActionAreaProps } from './CenterActionAreaProps';
import { CenterActionArea } from './CenterActionArea';
import { ViewTabBody } from './ViewTabBody';
import { MountedViewLayers } from './MountedViewLayers';
import { visibleTabs } from './shared/tab/visible-tabs';

type Properties = BaseCenterActionAreaProps & {
  mountedProps: Omit<React.ComponentProps<typeof MountedViewLayers>, 'tabs' | 'current' | 'visibleLabels' | 'client' | 'closeTab' | 'onSplit'>;
};

export function AppCenterActionArea({
  entries, tabs, activeTab, secondaryTab, client, closeTab, tabNameMaxLength,
  activeTabNameMaxLength, onFocusCommandBar, onFocusEditor, windowFocused, dirtyTabs,
  mountedProps,
}: Properties) {
  const splitTab = (index: number) => {
    client.send({ method: 'moveTabToOtherPane', params: { index } });
  };
  const visible = visibleTabs({ tabs, activeTab, secondaryTab });
  const secondaryIndex = visible.secondary ? tabs.findIndex((tab) => tab.label === visible.secondary?.label) : undefined;
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
      entries={entries} tabs={tabs} activeTab={activeTab} secondaryTab={secondaryIndex}
      client={client} closeTab={closeTab} tabNameMaxLength={tabNameMaxLength}
      activeTabNameMaxLength={activeTabNameMaxLength}
      onFocusCommandBar={onFocusCommandBar} onFocusEditor={onFocusEditor}
      windowFocused={windowFocused} dirtyTabs={dirtyTabs} renderBody={renderBody}
      persistentLayers={<>
        <MountedViewLayers
          tabs={tabs} current={visible.current} visibleLabels={visible.visibleLabels} client={client}
          closeTab={closeTab} onSplit={splitTab} {...mountedProps}
        />
      </>}
    />
  );
}
