import React from 'react';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from './ws';
import type { TabEntry } from './useTabEntries';
import { CenterActionArea } from './CenterActionArea';
import { ViewTabBody } from './ViewTabBody';
import { InactiveAgentTabBody } from './InactiveAgentTabBody';
import { ShellTabLayer } from './ShellTabLayer';
import { MountedViewLayers } from './MountedViewLayers';

type Properties = {
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
  current: TabView;
  focusedAgentBody: React.ReactNode;
  shellProps: Omit<React.ComponentProps<typeof ShellTabLayer>, 'tabs' | 'activeLabel' | 'visibleLabels' | 'client' | 'onSplit'>;
  mountedProps: Omit<React.ComponentProps<typeof MountedViewLayers>, 'tabs' | 'current' | 'visibleLabels' | 'client' | 'closeTab' | 'onSplit'>;
};

export function AppCenterActionArea({
  entries, tabs, activeTab, secondaryTab, client, closeTab, tabNameMaxLength,
  activeTabNameMaxLength, onFocusCommandBar, onFocusEditor, windowFocused, current,
  focusedAgentBody, shellProps, mountedProps,
}: Properties) {
  const splitTab = (index: number) => {
    client.send({ method: 'moveTabToOtherPane', params: { index } });
  };
  const secondary = secondaryTab === undefined ? undefined : tabs.at(secondaryTab);
  const visibleLabels = [current.label, ...(secondary ? [secondary.label] : [])];
  const renderBody = (entry: TabEntry, focused: boolean) => {
    const tab = entry.tab;
    if (tab.activePty || ['harness', 'editor', 'page', 'plugin'].includes(tab.view ?? '')) return null;
    const onSplit = () => splitTab(entry.index);
    if (tab.view) {
      return (
        <ViewTabBody
          tab={tab} client={client} index={entry.index}
          active={focused} onSplit={tab.view === 'notifications' ? undefined : onSplit}
        />
      );
    }
    return focused
      ? focusedAgentBody
      : <InactiveAgentTabBody tab={tab} client={client} onSplit={onSplit} />;
  };

  return (
    <CenterActionArea
      entries={entries} tabs={tabs} activeTab={activeTab} secondaryTab={secondaryTab}
      client={client} closeTab={closeTab} tabNameMaxLength={tabNameMaxLength}
      activeTabNameMaxLength={activeTabNameMaxLength}
      onFocusCommandBar={onFocusCommandBar} onFocusEditor={onFocusEditor}
      windowFocused={windowFocused} renderBody={renderBody}
      persistentLayers={<>
        <ShellTabLayer
          tabs={tabs} activeLabel={current.label} visibleLabels={visibleLabels}
          client={client} onSplit={splitTab} {...shellProps}
        />
        <MountedViewLayers
          tabs={tabs} current={current} visibleLabels={visibleLabels} client={client}
          closeTab={closeTab} onSplit={splitTab} {...mountedProps}
        />
      </>}
    />
  );
}
